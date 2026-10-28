# Workflow upgrade admission and retained release blockers

The production application still runs image `061033364840…`, labelled source
`08fae42763aae6d6c4fa24e7f32ec359bf41ddc7`, built 18 October. This checkpoint
prepares the upgrade path; it does not replace that application or worker.

## Native evidence

`scripts/verify-workflow-upgrade.mjs` exercises the exact migration SQL and normal
runtime-role provisioner from pinned source
`2ceadbae846e06b39fab86104cce6d581d6250b8`. All 119 baseline migrations and the
nine pending migrations 115–123 run in a fresh, marked disposable database in
the existing identity-checked PostgreSQL rehearsal service at 127.0.0.1:55433.
No customer database is cloned; no container, image, production migration,
configuration or paid-account state is changed.

The final native receipt is retained privately at
`.cache/workflow-upgrade/2ceadbae846e06b39fab86104cce6d581d6250b8/attempt-a3522162-f777-4857-9d84-4079dd9c5658/verification.json`.
It records 11 passing checks across five variants, the 128-file exact Git-byte
migration registry, verifier/contract/preservation-helper hashes, and confirmed
removal of its exact temporary database and random restricted runtime role.
Earlier attempts and their cleanup receipts are preserved.

| Variant | Observed result |
| --- | --- |
| Canonical 119-to-128 upgrade | Normal provisioner and idempotent rerun pass. Original values and all historical migration hashes remain unchanged. Historical boundary receipts are backfilled exactly. |
| Duplicate parcel number within a block | Migration 117 refuses the duplicate; neither row is deleted or renumbered. |
| Duplicate block number within a project | Migration 118 refuses the duplicate; original identities remain. |
| Unexpected legacy block foreign key | Migration 118 refuses the unreviewed shape without replacing it. |
| Malformed historical boundary receipt | Migration 123 refuses the inconsistent receipt without rewriting or losing it. |

Migration failures are atomic for the failed migration, not for the complete
batch: earlier successful migrations remain committed. The verifier checks the
exact remaining prefix and all original hashes/rows. No DOWN migration, ledger
rewrite or forced application is used.

Native restricted-role checks establish owner visibility and stranger refusal
for the retained boundary graph. PostgreSQL RLS refuses an UPDATE by affecting
zero writable rows; the privileged trigger defense also raises 42501. Old
fieldbook writers receive increasing revisions, new traverse coordinates retain
`500000.123456789012345` exactly, and direct block deletion cannot erase retained
children. Historical NULL, zero, Unicode, timestamps and original coordinate
values remain distinct and unchanged. These are database checks, not ordinary
account HTTP, browser, physical field or professional acceptance.

## Release implementation

The release allowlist now recognizes these nine reviewed versions. Candidate
build admission additionally requires the complete 119-to-128 proof, all five
variants, cleanup, no customer copy or production mutation, the selected source
SHA, and the exact planned 128-file migration registry. Older rehearsal evidence,
a missing variant, changed SQL or a partial manifest is refused.

The promotion data fingerprint previously covered 14 tables and omitted the
original cadastral/fieldbook records affected by this upgrade. The shared
`release-row-snapshot.mjs` now covers 22 tables, including users, projects,
blocks, parcels, traverses, coordinates, observations and fieldbooks. Promotion
and the native verifier use this same implementation. It retains the original
column catalog, compares normalized numeric values without discarding NULL,
and performs aggregate reads in a read-only repeatable-read transaction. Missing,
foreign or duplicate table catalogs and failed reads cannot produce a partial
preservation certificate. Row payloads are not printed or exported.

The full release/recovery contract set passes 64 tests, including the new
proof/snapshot refusals and static import without an installed `pg` client.
The source release checker and GitHub security job now include the new tests.
Direct ESLint invocation on six release `.mjs` files reports that neither typed
project includes them; the first sandboxed worker timed out. This is an open
tooling coverage gap, not a passing lint result. No lint baseline, exclusion or
suppression was added.

For a later selected release, rerun this verifier with that full commit SHA.
Do not relabel this receipt. A matching proof must be reviewed and placed at that
planned release's `upgrade-checks.json` before the normal build gate can consume
it. Candidate packaging, current-image rollback verification and recovery proof
remain separate prerequisites; no promotion action was executed here.

## Current production observations and remaining work

Bounded production aggregate/schema reads, in an explicit read-only transaction,
find 119 applied migrations, zero duplicate block/parcel identity groups, no
unexpected pending workflow tables or fieldbook revision column, and the two
expected validated non-deferrable cascading legacy block foreign keys. No
customer identifiers, observations or credentials are returned. These checks
reduce known preflight uncertainty; they do not prove an upgrade or restore.

The existing production verifier passes health/ownership checks. Worker artifact
verification still fails for outdated/missing modules, dependencies and task
declarations. The rollback tag differs from the current application image; the
runtime release identity is still unknown. The release helper's prior revision
comes from that runtime value and must be reconciled with the inspected OCI
revision before relying on its rollback path.

At `2ceadbae`, GitHub run 40699546587 has completed: Jest, app/test typing,
security, native design/set-out, Python worker, API typing, i18n and web/mobile
builds pass. Whole lint, accessibility and all four browser shards fail. This is
that source revision's CI, not acceptance of these later release-tool changes.

Actual recovery and the rejected customer-clone boundary, worker/app artifact
alignment, current-production rollback compatibility, final CI/UI acceptance,
owner-deferred signing-key rotation, provider/CAD/print and independent physical
field gates remain open. Production and the user's localhost CAD drawing are
preserved. The broader production-readiness goal remains active.
