-- Phase 2 (spec docs/SPEC.md §5): the catalog table, its retrieval indexes,
-- and its RLS/grant boundary.
--
-- Deliberately deviates from the spec's literal SQL in two places, both
-- documented in docs/DEFERRED.md and verified against this project's real
-- Postgres rather than assumed:
--   1. to_tsvector('english', text) — the two-argument form — is STABLE in
--      PostgreSQL (the named text search configuration could theoretically
--      change), not IMMUTABLE, so it cannot be used directly inside a
--      GENERATED ALWAYS AS column, which requires IMMUTABLE. periplo_fts()
--      below is the standard fix: wrap it in our own function and mark
--      THAT immutable, which is a safe promise here because this project
--      pins 'english' as a literal, not a variable.
--   2. unique (url, route_template, tool_name) — plain SQL UNIQUE treats
--      NULL as distinct from NULL, so two HTTP listings sharing the same
--      (url, route_template) with tool_name NULL in both rows would NOT
--      collide and could be inserted twice, silently defeating the
--      "one catalog entry per resource" intent. NULLS NOT DISTINCT (PG15+)
--      fixes this; Supabase's managed Postgres supports it.

create or replace function periplo_fts(input text)
returns tsvector
language sql
immutable
parallel safe
as $$
  select to_tsvector('english', input);
$$;

create table if not exists resources (
  id             uuid primary key default gen_random_uuid(),
  url            text not null,
  route_template text,
  tool_name      text,
  type           text not null check (type in ('http', 'mcp')),
  network        text not null,          -- CAIP-2, e.g. "stellar:testnet"
  pay_to         text not null,
  asset          text not null,
  amount         text not null,          -- i128 as string
  description    text,
  parameters     jsonb not null default '{}'::jsonb,
  accepts        jsonb not null default '[]'::jsonb,
  extensions     text[] not null default '{}',
  last_updated   timestamptz not null default now(),
  fts tsvector generated always as (
    periplo_fts(
      coalesce(description, '') || ' ' ||
      coalesce(jsonb_path_query_array(parameters, '$.*')::text, '')
    )
  ) stored,
  embedding vector(512),
  unique nulls not distinct (url, route_template, tool_name)
);

create index if not exists resources_fts_idx on resources using gin (fts);
create index if not exists resources_embedding_idx on resources using hnsw (embedding vector_ip_ops);

-- Not in the spec's literal SQL, added because GET /discovery/resources
-- (spec §4) filters on exactly these columns — plain btree indexes for
-- equality filters, distinct from the retrieval indexes above.
create index if not exists resources_network_idx on resources (network);
create index if not exists resources_type_idx on resources (type);
create index if not exists resources_pay_to_idx on resources (pay_to);

-- RLS: public read, writes only via the service role (spec §5 Phase 2).
alter table resources enable row level security;

create policy "resources are publicly readable" on resources
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy for anon/authenticated: with RLS enabled
-- and no matching policy, those operations are denied by default.
-- service_role bypasses RLS entirely (BYPASSRLS), so it doesn't need one.

-- Explicit grants: Supabase's current default does NOT auto-expose newly
-- created tables to the anon/authenticated Data API roles (see
-- supabase/config.toml's [api] auto_expose_new_tables comment) -- without
-- this, the RLS policy above is unreachable dead code, since PostgREST
-- would reject the request at the grant level before RLS is even
-- evaluated. Verified empirically against this behaviour, not assumed.
grant usage on schema public to anon, authenticated;
grant select on resources to anon, authenticated;
grant select, insert, update, delete on resources to service_role;
