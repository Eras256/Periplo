# Operations: fee-sponsor key rotation and runway monitoring

An SCF #45 panel review item, alongside `packages/helpers` (`README.md`,
`docs/DEFERRED.md`'s "Post-panel-review roadmap" section): document, and
where it applies, automate rotating the fee-sponsor key every 90 days or
on suspected exposure, with a no-downtime cutover, plus an alert when the
sponsor's XLM balance drops below a projected 48-hour fee runway.

**Real constraint found while scoping this, stated honestly rather than
smoothed over: no mainnet fee-sponsor key exists yet.** `periplo-mainnet`
(the Fly app) and any mainnet Stellar identity are both genuinely absent
(`docs/INFRASTRUCTURE.md`, [[periplo-mainnet-key-hygiene]]); mainnet
provisioning is expected at SCF Tranche #3 / Phase 10. A rotation runbook
for a key that doesn't exist can't be executed today. This document is
split accordingly: the rotation procedure below is written to be
mainnet-ready the day a real key exists, and the runway-monitoring script
is built and proven against the *existing testnet* fee-sponsor account
today, since a fee-sponsor account only ever holds native XLM
(`boot-safety.ts` enforces this at boot) and "how many hours of
fee-paying can this balance still cover" is the same question on testnet
as it will be on mainnet.

## Rotation cadence

Every 90 days, or immediately on suspected exposure of a fee-sponsor
secret (committed to a repo, pasted somewhere it shouldn't have been,
etc.). There is no automated cadence enforcement yet: this is a
documented human process, not a scheduled job, the same honest gap
`docs/MAINTENANCE.md` states for other unautomated processes rather than
implying more automation than exists.

## No-downtime cutover procedure

The mechanism this leans on already exists and is already proven live:
the channel-account pool (`core.ts`'s `channelAccountSecrets`,
CLAUDE.md's 2026-09-03 entry). `ExactStellarScheme`/`UptoStellarScheme`
round-robin across every configured signer for a network, each one an
independent Stellar account with its own sequence number. Rotating the
*primary* fee-sponsor signer is the same operation as rotating any pool
member, just applied to the one currently referenced by
`STELLAR_FEE_SPONSOR_SECRET_TESTNET`/`_PUBNET` rather than
`STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET`/`_PUBNET`.

1. **Generate a fresh keypair**, exclusive to Periplo
   (`stellar keys generate ... --network <testnet|pubnet>`, never
   reused or derived from another identity, [[periplo-mainnet-key-hygiene]]).
   Fund it with enough native XLM to operate (testnet: friendbot;
   mainnet: a real funding transaction, sized against the runway target
   below, not an arbitrary round number).
2. **Add the new key alongside the old one**, not in place of it: set it
   as an additional entry in `STELLAR_CHANNEL_ACCOUNT_SECRETS_TESTNET`/
   `_PUBNET` (`fly secrets set`, never committed to `fly.toml`, same rule
   `docs/SPEC.md` §7 already states for every secret). `assertNonCustodialSigner`
   runs against it at boot exactly as it does the primary: boot fails
   closed if the new key holds anything but native XLM.
3. **Deploy** (`fly deploy`). Fly's rolling deploy starts the new machine
   before stopping the old one, so this step itself does not interrupt
   traffic; "no downtime" here means no interruption to buyer-facing
   `/verify`/`/settle` availability during the cutover, not a literal
   zero-restart hot-swap of the running process.
4. **Verify the new key is live and reachable**, not just configured:
   `GET /supported` must list the new key's address in the network's
   signer set (confirmed live for the channel-account pool itself,
   CLAUDE.md's 2026-09-03 entry: "`GET /supported` listing all 4
   channel-pool signer addresses"). Optionally force a real settlement
   through the pool (`scripts/channel-accounts-burst-demo.ts`'s pattern)
   to confirm round-robin picks up the new account under real traffic,
   not just that it's listed.
5. **Promote the new key to primary**: move it from
   `STELLAR_CHANNEL_ACCOUNT_SECRETS_*` to
   `STELLAR_FEE_SPONSOR_SECRET_TESTNET`/`_PUBNET`, move the old key the
   other way (into the channel-accounts list) so it keeps absorbing
   traffic during a safety window rather than disappearing immediately.
   Deploy again.
6. **After the safety window** (a few days, long enough to see the old
   key stop being selected by round-robin and to confirm no in-flight
   transaction still references it), remove the old key from
   `STELLAR_CHANNEL_ACCOUNT_SECRETS_*` entirely and deploy once more.
7. **Retire the old key**: sweep its remaining native XLM balance to the
   new primary (a plain payment operation; a fee-sponsor account holds
   nothing else to sweep, by the same boot-time invariant that already
   enforces this), then discard the secret. Do not reuse a retired
   fee-sponsor keypair for anything else.

Every step above is real, already-exercised machinery
(`assertNonCustodialSigner`, the channel-account pool, `fly secrets set`
+ `fly deploy`, `GET /supported`), not new code invented for this
runbook; rotation is a specific sequence of operations this project can
already perform individually, documented here as one procedure for the
first time.

## Runway monitoring

`apps/facilitator/src/sponsor-runway.ts` (pure, unit-tested) and
`sponsor-runway-fetch.ts` (real Horizon calls) compute: current native
XLM balance, total fees charged by the sponsor account's own transactions
over a lookback window (default 24h), the resulting burn rate, and the
projected runway in hours. `scripts/sponsor-runway-alert.ts` is the
operational entry point: it reads the sponsor's PUBLIC key only (never
the secret, this is a read-only check), prints the numbers, and exits
non-zero when projected runway drops below a threshold (default 48h).

```
node --env-file=apps/facilitator/.env apps/facilitator/scripts/sponsor-runway-alert.ts
node ... sponsor-runway-alert.ts --network stellar:pubnet --threshold-hours 72
```

Run for real against the live testnet fee-sponsor before this was
written up as done, not just unit-tested against fakes: balance
`9999.2623571 XLM`, zero fee spend in the trailing 24h at the time of the
check, reported as infinite runway, exit 0. The 11 unit tests
(`sponsor-runway.test.ts`, `sponsor-runway-fetch.test.ts`) cover the
alerting path itself (a manufactured low-balance/high-burn scenario
triggers `belowThreshold`), which the live testnet account's own
currently-idle state can't exercise without spending real fees just to
prove it.

**Deliberately does not send a notification itself.** No email/Slack/
webhook channel is configured anywhere in this repo, and inventing one
here would be scope this tool doesn't own (spec §12: no invented scope).
Wire the script's own exit code into whatever already runs scheduled
checks for the deployment; none does yet, which is the honest, stated
gap this section leaves open rather than implying more automation exists
than does. A Fly scheduled machine or a GitHub Actions cron are the two
natural candidates, neither built.
