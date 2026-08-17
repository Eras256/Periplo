-- Phase 5 (spec docs/SPEC.md §5): hybrid retrieval: the RRF fusion
-- function, and correcting the embedding column's dimension.
--
-- Phase 2 pinned `embedding vector(512)` before an embedding model was
-- chosen. Phase 5 chose fastembed's BGESmallENV15 (384-dim, see
-- docs/DEFERRED.md for why: @x402-ecosystem-adjacent `@huggingface/
-- transformers` was ruled out because it hard-depends on `sharp`, whose
-- prebuilt libvips binary is LGPL-3.0, a hard deny under this project's
-- own licence-check policy, not a borderline call). Safe to alter in place:
-- the column has been all NULL since Phase 2 (Phase 4 never wrote
-- embeddings), so there is no data to migrate. The HNSW index must be
-- dropped before an ALTER COLUMN TYPE on a vector column and rebuilt after,
-- verified by running this migration against the real project, not
-- assumed.
drop index if exists resources_embedding_idx;
alter table resources alter column embedding type vector(384);
create index if not exists resources_embedding_idx on resources using hnsw (embedding vector_ip_ops);

-- Reciprocal Rank Fusion over the existing lexical (`fts`/gin) and semantic
-- (`embedding`/hnsw) indexes, per spec §5: "1 / (k + rank) with k = 50,
-- separate full_text_weight and semantic_weight... a single Postgres
-- function joining two CTEs with a full outer join."
--
-- `<#>` is pgvector's negative-inner-product operator (matches the
-- `vector_ip_ops` index above): smaller = more similar, so ascending order
-- is nearest-first, consistent with the other distance operators. Correct
-- only because both query and document embeddings are L2-normalized before
-- storage: `<#>` on unnormalized vectors is not a valid similarity
-- ordering.
--
-- Each CTE is capped at `least(match_count * 5, 200)` candidates before
-- fusion: RRF only needs a bounded candidate window per side, not a full
-- table scan, and 200 keeps the ranked-window cost predictable regardless
-- of how large the catalog grows.
create or replace function periplo_hybrid_search(
  search_query text,
  query_embedding vector(384),
  match_count int default 20,
  match_offset int default 0,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50
)
returns table (
  id uuid,
  url text,
  route_template text,
  tool_name text,
  type text,
  network text,
  pay_to text,
  asset text,
  amount text,
  description text,
  parameters jsonb,
  accepts jsonb,
  extensions text[],
  last_updated timestamptz,
  score float
)
language sql stable
as $$
  with lexical as (
    select r.id, row_number() over (
      order by ts_rank_cd(r.fts, websearch_to_tsquery('english', search_query)) desc
    ) as rank
    from resources r
    where search_query is not null and btrim(search_query) <> ''
      and r.fts @@ websearch_to_tsquery('english', search_query)
    order by ts_rank_cd(r.fts, websearch_to_tsquery('english', search_query)) desc
    limit least(match_count * 5, 200)
  ),
  semantic as (
    select r.id, row_number() over (order by r.embedding <#> query_embedding) as rank
    from resources r
    where query_embedding is not null and r.embedding is not null
    order by r.embedding <#> query_embedding
    limit least(match_count * 5, 200)
  )
  select
    r.id, r.url, r.route_template, r.tool_name, r.type, r.network, r.pay_to,
    r.asset, r.amount, r.description, r.parameters, r.accepts, r.extensions,
    r.last_updated,
    (coalesce(full_text_weight / (rrf_k + lexical.rank), 0) +
     coalesce(semantic_weight / (rrf_k + semantic.rank), 0)) as score
  from lexical
  full outer join semantic on lexical.id = semantic.id
  join resources r on r.id = coalesce(lexical.id, semantic.id)
  order by score desc
  limit match_count offset match_offset;
$$;

-- Public-read, matching the resources table's own RLS/grant boundary
-- (spec Phase 2: catalog is public-read).
grant execute on function periplo_hybrid_search(text, vector, int, int, float, float, int) to anon, authenticated;
