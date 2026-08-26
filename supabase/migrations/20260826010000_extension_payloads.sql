-- Fixes a real gap found live: `GET /discovery/resources` and
-- `GET /discovery/search` echoed `extensions.bazaar` as an empty `{}` for
-- every resource, including `temperature-convert` (the best-maintained
-- entry in the catalog), even though its own live 402 challenge carries
-- the full declared extension (info/schema/examples). Confirmed against
-- the installed `@x402/extensions` package's own `DiscoveryResource` type,
-- which documents this field as "Extension payloads echoed from
-- discovery (e.g. bazaar info/schema)" -- the catalog never persisted a
-- payload to echo, only which extension *keys* a resource declared
-- (`resources.extensions: text[]`). `extension_payloads` is the missing
-- half: one JSON object per resource, keyed by extension name, holding
-- the actual declared extension object as `discovery.ts`'s
-- `processBazaarExtension` already validates it, verbatim.
--
-- `not null default '{}'::jsonb` so existing rows (cataloged before this
-- migration) don't need a backfill to stay valid: they just report an
-- empty payload for their declared extension keys until the next payment
-- re-catalogs them with the new write path, same posture as `embedding`
-- staying `null` for pre-Phase-5 rows.
alter table resources
  add column if not exists extension_payloads jsonb not null default '{}'::jsonb;

-- periplo_hybrid_search's RETURNS TABLE shape is changing (a new column),
-- and CREATE OR REPLACE FUNCTION cannot change a function's return type,
-- only CREATE FUNCTION on a fresh signature or an explicit DROP first.
-- The previous migration (20260820103000_drop_old_hybrid_search_overload.sql)
-- already hit the sibling version of this exact class of error (an
-- argument-list change silently creating an overload instead of
-- replacing); dropping explicitly here avoids rediscovering the
-- return-type variant of the same lesson via a failed `supabase db push`.
drop function if exists periplo_hybrid_search(text, vector, int, int, float, float, int, float);

create function periplo_hybrid_search(
  search_query text,
  query_embedding vector(384),
  match_count int default 20,
  match_offset int default 0,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50,
  min_semantic_similarity float default 0.6
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
  extension_payloads jsonb,
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
      and (r.embedding <#> query_embedding) <= -min_semantic_similarity
    order by r.embedding <#> query_embedding
    limit least(match_count * 5, 200)
  )
  select
    r.id, r.url, r.route_template, r.tool_name, r.type, r.network, r.pay_to,
    r.asset, r.amount, r.description, r.parameters, r.accepts, r.extensions,
    r.extension_payloads, r.last_updated,
    (coalesce(full_text_weight / (rrf_k + lexical.rank), 0) +
     coalesce(semantic_weight / (rrf_k + semantic.rank), 0)) as score
  from lexical
  full outer join semantic on lexical.id = semantic.id
  join resources r on r.id = coalesce(lexical.id, semantic.id)
  order by score desc
  limit match_count offset match_offset;
$$;
