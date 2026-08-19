-- One-time backfill for `resources.url` rows the write-time gate
-- (packages/bazaar/src/catalog-url.ts's checkCatalogUrl, wired into
-- upsertCatalogResource the same day) now rejects going forward, for
-- whatever was already written before that gate existed. Found by real
-- external QA; see CLAUDE.md's Architecture section for the full writeup.
-- Mirrors checkCatalogUrl's rules; keep both in sync if that rule changes.
--
-- Two real, independently confirmed bad rows motivated this, both still
-- live in the catalog as of 2026-08-19:
--   1. url = 'null/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c',
--      cataloged 2026-08-11, type = 'mcp'. The opaque-origin bug
--      (docs/INTEROP.md, x402-foundation/x402#3121): predates the
--      reconstruction fix in apps/facilitator/src/discovery.ts, which only
--      applies to writes made after it landed.
--   2. url = 'http://localhost:4022/exact/stellar', cataloged 2026-08-17,
--      type = 'http'. Not an opaque-origin problem at all, just an
--      unreachable local host nothing validated against before this write-
--      time gate.

-- Step 1: rewrite what's recoverable. For type = 'mcp' rows with tool_name
-- set, the correct canonical url is always exactly 'mcp://tool/' ||
-- tool_name, the same construction discovery.ts now uses for new writes.
-- If a correctly-cataloged row for that same tool already exists (the
-- resource was paid for again after the code fix landed), delete the
-- stale null/* duplicate instead of failing the rewrite on the unique
-- (url, route_template, tool_name) constraint: the newer, correct row
-- already carries whatever `accepts` history matters.
delete from resources bad
using resources good
where (bad.url = 'null' or bad.url like 'null/%')
  and bad.type = 'mcp'
  and bad.tool_name is not null
  and good.id <> bad.id
  and good.url = 'mcp://tool/' || bad.tool_name
  and good.route_template is not distinct from bad.route_template
  and good.tool_name is not distinct from bad.tool_name;

update resources
set url = 'mcp://tool/' || tool_name
where (url = 'null' or url like 'null/%')
  and type = 'mcp'
  and tool_name is not null;

-- Step 2: delete anything the write-time gate would now reject and step 1
-- couldn't recover: a still-opaque null/* row with no tool_name to
-- reconstruct from (fabricating a guessed url would violate this
-- project's own "no capability claims without evidence" rule applied to
-- data, not just docs), and any row on a local host (localhost, 127.0.0.1,
-- *.local) -- the class of bug the null/* fix never touched at all, e.g.
-- the real http://localhost:4022/exact/stellar row above. Host extracted
-- the same way checkCatalogUrl parses it: strip the http(s) scheme, take
-- everything up to the next '/' or ':'.
delete from resources
where url = 'null'
   or url like 'null/%'
   or lower(substring(url from '^https?://([^/:]+)')) in ('localhost', '127.0.0.1')
   or lower(substring(url from '^https?://([^/:]+)')) like '%.local';
