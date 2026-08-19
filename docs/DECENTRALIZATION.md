# Decentralization

`docs/SPEC.md` §11 asks for this position stated explicitly rather than
left implied. It is:

## The index is off-chain by design, not by default

Periplo's catalog (`resources` in Supabase/Postgres) is not a Soroban
registry, and that's a deliberate choice, not an omission to fix later.
An on-chain index has two real costs a discovery layer would pay on
every listing and every query:

- **Rent.** A Soroban ledger entry needs its TTL extended or it's
  evicted. A catalog that grows with every new listing (which is the
  whole point of automatic cataloging, spec Phase 4) would need ongoing
  rent-extension transactions just to keep old listings alive, a cost
  that scales with catalog size for no functional benefit over an
  off-chain index.
- **Per-payment cost, doubled.** Anchoring each catalog write on-chain
  would mean a second Soroban transaction for every payment that
  catalogs a resource, on top of the settlement transaction itself. The
  real settled transactions in `conformance/RESULTS.md` are one
  transaction each; an on-chain index would make every one of them two.

Neither cost buys anything a well-run off-chain index with a
public, unauthenticated read API doesn't already provide: `GET /discovery/resources`
and `GET /discovery/search` are public, no API key, same as an on-chain
read would be, just without the rent and the doubled settlement cost.

## Decentralization here means replicability, not on-chain storage

Three real properties, not aspirational ones, each checkable against
what's actually in this repository:

1. **A permissive licence.** Apache-2.0, the whole repository
   (`LICENSE`), enforced in CI by `packages/licence-check` so nothing
   copyleft ever enters the shipped dependency path. Anyone can fork,
   read, modify, and redeploy every line of this without asking.
2. **First-class self-hosting.** `Dockerfile.facilitator` and
   `fly.facilitator.toml` are the literal recipe this project's own
   deployment uses (`fly deploy --config fly.facilitator.toml --dockerfile
   Dockerfile.facilitator -a periplo-testnet`, see the
   [Deployment](../README.md#deployment-what-actually-runs) section of
   the README); a fork pointed at a different Fly app name (or any other
   host that can run the same Docker image) runs the identical
   facilitator under a different operator. `docs/SELF-FACILITATION.md`
   goes one step further: a seller doesn't need even that, the
   facilitator core is importable directly into their own process, no
   separately-operated instance of Periplo at all.
3. **An interoperable catalog format.** The schema
   (`supabase/migrations/*.sql`) is plain Postgres: a `resources` table,
   a GIN full-text index, an HNSW vector index, standard RLS. Nothing
   about it is a proprietary format that locks a catalog's contents into
   one operator's database; any Postgres instance with `pgvector` can
   host the same schema, and the wire shape the catalog is built from
   (`@x402/extensions/bazaar`'s discovery extension) is the same official
   protocol extension any other x402 facilitator implementing Bazaar
   would read.

## What this means concretely: no operator is a single point of failure

If Periplo's own hosted instance (`periplo-testnet.fly.dev`, and
eventually a `periplo-mainnet` equivalent) disappeared entirely, nothing
about the protocol requires it to keep existing: a seller already
self-facilitating loses nothing (`docs/SELF-FACILITATION.md`'s whole
point), a seller pointed at Periplo's hosted instance could redeploy the
identical Docker image under their own operator with no code change, and
the catalog schema itself could be stood up fresh from the committed
migrations by anyone. The discovery layer's value is in the protocol and
the schema being open and replicable, not in Periplo being the only place
either can run.
