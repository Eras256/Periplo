-- Fixes a real search relevance-floor bug found by a live user re-testing
-- the catalog against apps/facilitator/src/discovery-routes.ts's own
-- deployment, reproduced independently against the same live database
-- before this migration was written (not just trusted from the report):
--
--   GET /discovery/search?query=weather+forecast
--   GET /discovery/search?query=financial_analysis
--
-- both wrongly returned the same single resource (the demo
-- temperature-convert HTTP resource) regardless of true relevance, with
-- `partialResults: false` implying a complete, confident match. Two
-- independent, stacked causes, both fixed here:
--
--   1. The `fts` generated column (20260807202307_resources.sql) only ever
--      indexed `description`/`parameters`. A resource cataloged with a real
--      identity (`tool_name`) but no description yet, like the live
--      `mcp://tool/financial_analysis_da8703fa-...` row (cataloged
--      2026-08-11, predating the Phase 5 embedding pipeline entirely), is
--      unsearchable by its own literal name: `to_tsvector('english',
--      coalesce(description,''))` on a null description is an empty
--      tsvector. Verified directly against this project's own live
--      database with `pg` (not asserted): the tokenized tool_name string
--      does contain a lexeme matching `websearch_to_tsquery('english',
--      'financial_analysis')`, so folding `tool_name`/`route_template`
--      into the indexed text closes this for good, not just for this one
--      row.
--   2. `periplo_hybrid_search`'s semantic leg (20260812080000_search.sql)
--      had no similarity floor: it ranks the `match_count * 5` nearest
--      embedded rows by `<#>` distance unconditionally, so with only one
--      embedded row in the live catalog, that row was "nearest" (and
--      therefore returned with a nonzero RRF score) for literally any
--      query string, including ones with no real relevance at all. Real
--      cosine similarities were measured with the actual production model
--      (BGESmallENV15) before picking a threshold, not guessed:
--        temperature conversion       0.8701   (true match)
--        fahrenheit to kelvin         0.8676   (true match)
--        celsius to fahrenheit        0.8639   (true match)
--        temperature (bare)           0.8472   (true match)
--        how hot is it in celsius     0.8275   (true match)
--        --------------------------------------------------
--        weather forecast             0.7642   (false positive, the bug report)
--        unit conversion               0.7616   (plausible true match, lost)
--        F to C calculator             0.7452   (plausible true match, lost)
--        currency exchange rate        0.7030   (false positive)
--        stock market data             0.7000   (false positive)
--        weather in paris               0.6968   (false positive)
--        financial_analysis            0.6846   (false positive, the bug report)
--        translate text to spanish     0.6617   (false positive)
--        flight booking api            0.6465   (false positive)
--        hello world                   0.6452   (false positive)
--        restaurant recommendation     0.5991   (false positive)
--      There is no clean separation: BGESmallENV15's own anisotropy puts
--      unrelated short queries in the 0.60-0.77 band, overlapping the low
--      end of genuinely-related paraphrases. A floor of 0.8 clears every
--      measured true match and both reproduction cases from the bug
--      report, at the honest cost of also excluding two plausible
--      near-miss paraphrases ("unit conversion", "F to C calculator") for
--      this specific resource. Revisit this constant once the catalog and
--      eval/golden.jsonl both have enough real, non-toy resources to
--      calibrate against something better than one demo listing; tracked
--      in docs/DEFERRED.md, not silently accepted as final.

-- Part 1: fold tool_name and route_template into the indexed text. A
-- GENERATED ALWAYS AS STORED column's expression can't be altered in
-- place (Postgres has no ALTER COLUMN ... SET EXPRESSION), so this drops
-- and recreates it; ADD COLUMN on a stored generated column forces a full
-- table rewrite that recomputes it for every existing row, so this is
-- also the backfill, no separate UPDATE needed.
drop index if exists resources_fts_idx;
alter table resources drop column fts;
alter table resources add column fts tsvector generated always as (
  periplo_fts(
    coalesce(description, '') || ' ' ||
    coalesce(tool_name, '') || ' ' ||
    coalesce(route_template, '') || ' ' ||
    coalesce(jsonb_path_query_array(parameters, '$.*')::text, '')
  )
) stored;
create index if not exists resources_fts_idx on resources using gin (fts);

-- Part 2: a semantic similarity floor. Appending a new parameter with a
-- default at the end keeps this a same-signature CREATE OR REPLACE for
-- every existing caller (packages/search/src/hybrid-search.ts included),
-- and existing grants on the function persist across a same-OID replace,
-- so no separate GRANT statement is needed here.
create or replace function periplo_hybrid_search(
  search_query text,
  query_embedding vector(384),
  match_count int default 20,
  match_offset int default 0,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50,
  min_semantic_similarity float default 0.8
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
      -- `<#>` is negative inner product; on the L2-normalized vectors this
      -- project stores, that's exactly negative cosine similarity, so
      -- "similarity >= min_semantic_similarity" is "<#> <= -min_semantic_similarity".
      and (r.embedding <#> query_embedding) <= -min_semantic_similarity
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
