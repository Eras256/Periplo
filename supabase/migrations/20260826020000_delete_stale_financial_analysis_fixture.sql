-- Deletes the one remaining Phase 4 test fixture still live in the
-- catalog: `mcp://tool/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c`,
-- cataloged 2026-08-11. The 2026-08-19 backfill
-- (20260819120000_backfill_bad_catalog_urls.sql) rewrote this row's URL
-- from the broken `null/...` opaque-origin form to this correct
-- `mcp://tool/{toolName}` shape, but never touched its content: `asset`
-- ("CTESTASSET") and `pay_to` ("GPHASE4TEST") are literal placeholder
-- strings, neither a structurally valid Stellar value (a real Soroban
-- contract ID is 56 characters; "CTESTASSET" is not), `description` is
-- null, and there is no real MCP tool behind this URI to ever serve a
-- request. Confirmed still live and unchanged via the real REST API
-- before writing this migration, not assumed from old docs.
--
-- Every search result on the live catalog surfaced this row regardless of
-- query relevance (confirmed: both a `financial_analysis` query and an
-- unrelated `weather` query returned it), which is real pollution now
-- that a genuine resource (temperature-convert) exists to compare
-- against. Deleted rather than "corrected" with different placeholder
-- values: there is no real service to describe honestly, so the accurate
-- fix is removing the row, not dressing it up. Same precedent as the
-- 2026-08-19 backfill's own posture: "deletes anything left that the
-- gate would now reject."
delete from resources
where url = 'mcp://tool/financial_analysis_da8703fa-2ee7-4922-aed5-b8cee63b908c'
  and asset = 'CTESTASSET'
  and pay_to = 'GPHASE4TEST';
