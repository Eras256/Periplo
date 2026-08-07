-- Phase 2 (spec docs/SPEC.md §5): extensions the resources table depends on.
--
-- pgcrypto: gen_random_uuid() for the primary key default.
-- vector (pgvector): the `embedding vector(512)` column and its HNSW index,
--   used by Phase 5 semantic search. Enabling it now, in its own migration,
--   keeps the "if this fails, which statement failed" story simple.
create extension if not exists pgcrypto;
create extension if not exists vector;
