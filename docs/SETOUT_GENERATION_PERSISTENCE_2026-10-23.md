# Drainage and grid target-generation persistence

23 October 2026. This is verified source and native synthetic PostgreSQL work;
the production application has not been promoted by this increment.

## Reproduced defects

Both `save_drainage_definition` and `save_definition` acquired a pool client
without releasing it on success, rollback or an early response. Repeated field
preparation could consume the entire application pool.

Both paths also reported the calculated target count without checking how many
rows PostgreSQL actually inserted. A real BEFORE INSERT trigger suppressing
target writes yielded HTTP 201 with no saved targets. The initial ownership
check preceded the save transaction, so an intervening committed owner transfer
or removal still allowed generation. Grid generation did not revalidate its
prepared reference system. Finally, suppressed grid geometry/metadata updates
could leave new targets under an old or unconfirmed definition while reporting
success.

These were observed with actual source handlers and SQL, not inferred from
source alone. The first native run failed all 16 original checks, including the
pool-return assertions. A later targeted run reproduced the two remaining grid
definition-update failures after the initial repairs.

## Repair

- Both generation paths return their client exactly once in `finally`, including
  early 403/404/409 responses. A failed rollback destroys the leased connection
  rather than returning its uncertain transaction to the pool.
- Both take the project generation advisory lock, then hold the reference and
  project rows while validating recorded ownership and saving targets. A
  committed transfer/unassigned owner is refused before writes. A transfer
  attempted after the project row is locked waits until generation commits.
- The full canonical reference declaration plus legacy datum/zone/hemisphere is
  compared with the prepared snapshot. Benchmark, geoid, calibration and scale
  provenance edits cannot be hidden by an unchanged displayed CRS name. Drainage
  additionally compares its prepared design hash as before.
- Every target batch requires the exact inserted row count. Grid geometry and
  definition metadata require one confirmed updated row. Any short write rolls
  back the entire transaction, including earlier batches and definition changes.
- Existing definition updates hold a row lock. No raw observation, existing
  target revision, applied migration, numeric survey engine or UI font was
  rewritten by this change.

## Verification

The focused set-out suite passes **41 tests across three suites**, including
both generation actions, missing/changed owners, missing project/definition,
reference/provenance changes, SQL and rollback failure, short writes, profile
snapshots and existing shot-replay regressions. The initial new suite reproduced
18 failures out of 19 cases after correcting invalid fixture inputs; the two
definition-update regressions were separately observed failing before repair.

`node scripts/verify-setout-generation.mjs green` passes **22 native PostgreSQL
checks** against the existing, exact-ID rehearsal service on loopback port 55433
and its marked `metardu_runtime_verify` database. It creates one random,
comment-marked schema and copies the required table structures there; it never
updates the corresponding public tables. Cases include:

- Complete drainage and grid schedules with no outstanding leased client.
- Actual SQL exceptions, suppressed point writes, and later-batch suppression
  after an earlier batch inserted successfully.
- Failed regeneration preserving the original definition and target history.
- Suppressed grid geometry/metadata updates refusing success.
- Committed owner changes before persistence and a real concurrent transfer
  waiting on the held project row.
- A changed design/height reference and a missing definition.
- Twenty-five consecutive drainage saves through a two-connection pool,
  retaining one definition, 25 revisions and all 75 target rows.

Before/after fingerprints match for the original public projects, reference
systems, definitions, targets, observations and tolerance profiles. All **120**
original migration ledger entries/checksums match. The exact owned fixture
schema was removed and source hashes matched at completion. Temporary triggers
exist only inside that removed schema. The harness explicitly destroys only
its own leaked fixture clients during red runs so cleanup can finish.

The extended verifier initially encountered a one-second connection timeout and
a syntax error in its added fault trigger. The connection allowance was changed
to five seconds and the test SQL corrected. No production lifecycle action or
application SQL change was used to bypass those harness failures.

Receipts are under `.cache/setout-generation/`: `red-initial.json`, `red.json`,
`green.json`, `source-green.json` and `definition-red.json`. The first unit red
receipt is `.cache/setout-generation-red.json`. The native receipt records exact
source hashes, fixture identity, each case, preservation and cleanup.

## Separate acceptance boundaries

Source: both final application/test TypeScript projects, scoped ESLint for all
four changed/new TypeScript files, and the security gate passed. The gate
confirmed 119 pinned applied migrations and scanned 668 test / 3168 source
files. The scoped diff whitespace check and verifier syntax check passed.
This repair introduces no migration.
Concurrent topographic/curve/account work and the separate migration 116 remain
part of coordinated release review; this milestone does not accept those edits.

Native: the source handlers and ownership helper execute real SQL, while the
outer authentication/rate-limit layer is a bounded test adapter. The copied
fixture tables do not establish production RLS or ordinary-account HTTP/browser
acceptance. Lost COMMIT acknowledgement, request-bound generation recovery,
actual export/print and the other set-out recording paths retain their separate
acceptance requirements. The follow-up reference-system read/write and panel
audit is recorded in `REFERENCE_DECLARATION_INTEGRITY_2026-10-23.md`, including
the later native ownership/atomicity proof. This generation guard does not
claim to repair every project writer.

Live: the required read-only `npm run docker:verify` passed the existing one-app
stack and supporting services before native work. Backup completion was
`2026-10-23T10:25:43Z`, archive/header evidence only. No image was built, production
record changed, migration applied, application restarted or customer database
cloned. Public availability recovery is documented separately in
`PUBLIC_AVAILABILITY_2026-10-23.md`.

External: approved control/design, physical instruments/field observations,
receiving software and professional acceptance cannot be inferred from this
synthetic transaction proof. The owner's signing-key rotation deferral and
ChatGPT notice/deployment/consent gates remain unchanged. The overall
field-to-finish production goal remains active.
