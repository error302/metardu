# Fieldbook native acceptance preflight

22 October 2026. This checkpoint prepares the existing rollback-only Fieldbook
probe; it is not a completed database or browser delivery test.

The required `npm run docker:verify` passed. Existing app, worker, PostgreSQL,
Redis, collaboration and NTRIP are healthy; backup is running without a configured
healthcheck. The migration service completed with the application image, and the
single-app/no-dated-image/builder inventory passed. Its latest backup completion
line is 2026-10-22T02:00:03Z. That is the verifier's limited log/freshness result,
not an independently restored recovery set.

## Exact existing synthetic target

- Container: `metardu-schema-rehearsal-20261008`.
- ID: `ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0`.
- State at inspection: exited, not running.
- Ownership label: `metardu.purpose=schema-rehearsal`.
- Image: `sha256:4738bee21eb6625cbfa35a67ac6863c850e58a45a0f1505c0c2db5fb68c7d596`.
- Published PostgreSQL binding: `127.0.0.1:55433` only.
- Data volume: `99e70f5a5b09ef69aea09e09b20ceede9507cf329142c8457b3f802bf8a311a4`.

All container consumers of that exact volume were inspected: the stopped
synthetic container is its sole consumer. Production PostgreSQL instead uses
`metardu_postgres_data`. They do not share database storage. Environment values,
customer records and credentials were not printed during these metadata checks.

## Prepared guarded probe

The existing ignored helper is
`.cache/fieldbook-delivery/verify-schema-rollback.mjs`. It checks the exact
container ID/label/loopback binding before connecting, then the expected database
marker and owned synthetic fixture. Its target is `metardu_runtime_verify` and
its restricted execution role is `release_app`; it does not load production env.
Review the helper again before executing after any source change.

Inside one transaction it applies the **UP section only** of the still-unapplied
`115_fieldbook_delivery_revisions.sql`, sets local lock/statement timeouts, and
creates named synthetic rows. It exercises raw payload preservation, revision
advancement, exact snapshot receipts, baseline rejection, viewer access, receipt
immutability, sequence restrictions and delete/recreate revision identity. It
then rolls back and compares original Fieldbook/capture data and the migration
ledger, confirms the new objects are absent, and confirms fixture rows are gone.
The finally block also attempts rollback on failure. No persistent application
migration or customer clone is part of this probe.
The fingerprint covers the named books/capture/batch tables and ledger, not every
database object. PostgreSQL sequence counters can advance across rolled-back
transactions; table rollback must not be described as a byte-for-byte database
snapshot restoration. This remains an explicitly synthetic test environment.

The migration source hash inspected at this checkpoint is
`6531ac8fdae608325cc0344e5c3b1fa75eefb10b2f440c9c5256cee509197505`.
No applied migration hashes were changed. Previous logs contain a raw-payload
comparison failure; the current helper uses deep structural comparison rather
than JSON property-order comparison. Its corrected run remains **unexecuted**.
Neither the historical failure nor corrected source is evidence of a passing
native migration test.

Starting the existing stopped target and running this transaction requires the
separate pending database-action approval. Earlier source-only approvals did not
authorize that execution. No service was started, SQL applied or schema/record
changed during this preflight. A successful rollback test would still not make
migration 115 available to HTTP/browser delivery: applying it persistently even
to the synthetic environment is a distinct step requiring a reviewed plan.

## Source-preview observation

The existing host preview session is confirmed live; it was not restarted or
duplicated. A restricted shell fetch returned `EACCES`, which was not treated as
evidence the server had stopped. CUA subsequently displayed the actual sign-in
page at the owned `http://127.0.0.1:3021/login` origin. Its initial navigation
observation timed out; inspecting the same created tab showed the page loaded.
No second tab/server was created to work around that timeout.

No sign-in, browser-storage access/mutation, session injection, Fieldbook save or
training-drawing modification occurred. The temporary source tab is retained for
continuation. This proves only that the source sign-in page renders, not that
authentication, receipt delivery, reload recovery or offline replay succeeds.
The database restart/rollback probe, authenticated browser flow, device behavior,
production promotion and field acceptance remain open.
