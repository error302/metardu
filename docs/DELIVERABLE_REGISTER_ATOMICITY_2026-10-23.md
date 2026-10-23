# Atomic document registration and concurrent exports

Date: 23 October 2026 (Africa/Nairobi).

This continues the production-readiness work after the tested worker candidate
in `WORKER_RELEASE_HARDENING_2026-10-23.md`. It repairs the existing document
register rather than introducing another register or changing applied migrations.

## Reproduced failures

The old writer used separate pooled queries to find/update the current
deliverable, insert its revision, record evidence and reread the result.
Native PostgreSQL probes reproduced five failures:

1. A rejected revision insert left an existing register's revision counter
   advanced without the corresponding revision.
2. Evidence insertion failure was swallowed after the register/revision committed.
3. A trigger silently suppressing revision insertion still produced an apparent
   successful registration without a revision.
4. Two first exports could compete for the unique live-document row; one failed
   instead of both receiving consecutive revisions.
5. A new revision retained the preceding approval's reviewer/time and stale
   source-revision metadata while presenting itself as in review.

The concurrency probe holds a task-owned PostgreSQL advisory lock inside an
owned insert trigger until both real requests reach a lock wait. It does not
depend on an arbitrary sleep to produce overlapping first exports. The two
other checks (content/evidence fidelity and missing-project refusal) already
passed before the repair.

## Source repair

`registerDeliverable` now uses one existing `db.transaction` and a transaction
advisory lock for the project/document-type stream, covering the first append
when no row exists. The selected current row is also locked. Updates/inserts
require a returned row. The revision, current metadata and default export
evidence commit together or all roll back.

The evidence helper accepts the caller's transaction client and refuses a
silently suppressed event insert. Existing callers retain their normal behavior.
Default document registration no longer swallows evidence failures; explicit
`evidence: null` remains an opt-out for callers that deliberately request it.

New revisions clear old approval fields and update the current source revision,
title and generating user. Previous immutable revision content/hashes are retained.
Returned current metadata comes from the same transaction/revision, so another
export cannot replace it between registration and rereading. The request's
metadata and serialized manifest are captured before waiting for its stream lock.

This does not approve a document, certify field accuracy or guarantee an entire
project's evidence hash chain under every other writer. Revision-bound approval,
global evidence-chain concurrency and upstream source-snapshot consistency remain
separate review work. The existing project export route still allows an explicitly
warned download when registration fails; this repair does not turn that recovery
copy into a registered or approved issue.

## Native and source evidence

`node scripts/verify-deliverable-register.mjs red` reproduced five failures and
two pre-existing passes. After repair the initial `green` run passed **all seven checks**:
revision-failure rollback, evidence-failure rollback, silent-insert refusal,
deterministic competing exports, approval/source reset, exact UTF-8 content/hash/
manifest/evidence identity, and missing-project refusal.

The verifier checks the exact existing synthetic container ID, purpose label,
loopback binding and database ownership marker before work. It creates one
uniquely marked schema with fixture users/projects and document tables derived
from the existing migration's document-register SQL. It executes the actual
TypeScript register and evidence helper against PostgreSQL, replacing only the
database adapter with the fixture pool. It does not copy a customer database,
apply a migration, alter public tables or create a service/container.

Final native evidence confirms its exact fixture schema was removed, all prior
public migration version/checksum entries remained unchanged, and both tested
source hashes stayed unchanged throughout the run. It is native SQL/concurrency
evidence, not production access/RLS, browser-download or field acceptance.

The focused export, observation and adjacent provenance/design regression run
passes **53 checks across five suites**. Both strict TypeScript projects and
scoped ESLint pass after the final typed database-adapter correction. The source
compiler caught an incompatible overloaded `pg` query union during implementation;
the final adapter explicitly forwards the same typed query to the selected client.

The maintained native verifier also has a fixed `--ci` mode for the existing
design-revision PostgreSQL job. It requires `CI=true`, the fixed disposable CI
database and no customer migration ledger; arbitrary database overrides are
rejected. The existing CI job now invokes it and retains its receipt. Remote CI
has not been executed in this chat.

Local receipts: `.cache/deliverable-register/red.json` and `green.json`.
The CI receipt is `test-results/deliverable-register/green.json`. Production
remains separate and unchanged by these fixture tests. These app-source changes
are not included in a promoted application image, and the broader production
goal remains open.

## Source integration review

The maintained verifier now also suppresses an evidence insert through an owned
fixture trigger. Attempting a later export must reject with the missing-evidence
error and leave the existing register, immutable revisions and evidence exactly
unchanged. This exercises the actual evidence helper's returned-row guard in a
real transaction, rather than only testing a thrown database error.

The final native run passes **all eight checks**. Its receipt confirms removal
of the uniquely owned schema, unchanged public migration history and unchanged
hashes for both tested source files. The adjacent run passes **33 tests across
five suites**: project export declaration, workbook provenance, design-save
atomicity, saved survey-report export and observation batches. Scoped ESLint and
the verifier's Node syntax check pass. The earlier 53-test run and this 33-test
run cover different selections and are not additive unique-test counts. Both
application/test TypeScript projects and the source security gate pass after
this review; all 119 pinned applied migration hashes remain intact.

Only the deliverable-register invocation and receipt lines are selected from
the shared CI file for this source integration. Concurrent corridor-verification
changes remain with their own source. Remote CI, production/RLS access,
registered browser downloads, global evidence-chain concurrency and professional
approval remain separate acceptance gates; no production service was changed.
