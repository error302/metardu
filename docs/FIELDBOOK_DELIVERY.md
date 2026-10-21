# Revision-bound Fieldbook delivery — source checkpoint

Status: the new authority and migration are source work. The current Fieldbook
page/outbox still uses the legacy save path. Migration 115 has not been applied
persistently to the marked test database or promoted by this checkpoint. The
retained local pending operation is not reconciled or claimed delivered.

## Problem and intended behavior

`persistFieldbook` currently stages device data, sends a generic upsert and
accepts a returned book ID as acknowledgement. Its session check is separate
from the later mutation. Queue replay compares device/server timestamps before
writing, rather than atomically comparing the revision that was reviewed. It
also stops attempting an operation after three failures while the UI suggests
Sync can retry. These boundaries are insufficient for safe concurrent recovery.

The new `/api/fieldbook/delivery` authority accepts an explicit
`fieldbook-save-v1` request, retained request UUID, project/book identity, raw
working-book payload and reviewed base revision. A null baseline means create
only; it never adopts a newer server book automatically. HTTP requests require
the authenticated retained-owner precondition. Current project recording access
is rechecked, and another author's book cannot be retagged or moved.

Project/request/book locks and a revision-conditional update protect a save.
An immutable receipt binds the complete request hash, intended payload hash,
actor, baseline and saved revision. An edit retains both the complete prior
snapshot and the new snapshot in the same transaction, including the first
legacy revision. Missing or rebound acknowledgements and audit failures roll
the operation back. The same request replays its original receipt without
overwriting later edits; the separately returned current revision tells a
client that the receipt snapshot may no longer be the latest book.

Original `sourceImport` context, including opaque legacy metadata, cannot be
dropped or replaced by an ordinary working-book edit. Raw values and special
own JSON keys are retained rather than coerced or silently removed. Delivery
receipts explicitly retain `fieldVerified:false`; they are not computation,
control, project acceptance or professional approval receipts. Archived work
remains readable and prior delivery can be acknowledged, while new writes cannot
reactivate archived/deleted/unknown-status books.

## Additive migration and compatibility

`115_fieldbook_delivery_revisions.sql` adds a revision column and a fresh
database-wide sequence. Existing rows initially have revision zero; future
insert/update operations receive server tokens even through older writers.
Tokens are opaque, may contain rollback gaps, and do not depend on device time
or an assumed consecutive per-book counter. Delete/recreate must not reuse an
old token. These are explicit delivery identities rather than PostgreSQL's
short-lived row transaction identities ([system-column documentation](https://www.postgresql.org/docs/current/ddl-system-columns.html)).

The receipt table has owner/project RLS, constrained baseline/new snapshots and
application append/read privileges. Application receipt mutation is refused;
existing explicit user/project deletion retains its FK lifecycle. The migration
refuses unexpected pre-existing delivery objects and is forward-only once
delivery history exists. Applied migrations 000–114 are untouched; no checksum
repair or rejected customer clone was bypassed. Before migration readiness, the
new service fails closed with a schema-not-ready response.

The legacy generic writer is deliberately still unchanged at this source
checkpoint. Its ability to bypass revision preconditions is an activation
blocker, not a supported concurrent-write escape hatch. Do not promote this as
the completed recovery repair before the client and legacy gate are migrated.

## Evidence actually obtained

- `.cache/fieldbook-delivery-red.log` first reproduced the unimplemented save
  authority; subsequent red logs cover rebound receipt identity, missing source
  retention, missing prior snapshots, absent field-verification separation and
  archived recovery. The route tests also reproduced valid cross-context JSON
  being rejected, then passed after correcting the validator. Malformed revision
  text no longer escapes validation through a `BigInt` exception.
- `.cache/fieldbook-delivery-final-source-tests.log`: 23 checks across three
  suites passed, including two accepted revisions followed by replay of the
  earlier request, stale and wrong-owner refusal, exact acknowledgements,
  rollback modeling, source/history preservation and private HTTP route wiring.
  The transaction tests use a stateful query model with rollback and retained
  receipts; they are not native PostgreSQL or concurrent-browser proof.
- Final application/test typing and scoped lint are recorded in
  `.cache/fieldbook-delivery-verified-final-types.log` and
  `fieldbook-delivery-final-source-test-types.log` and
  `fieldbook-delivery-final-source-lint.log`. Security evidence is
  `fieldbook-delivery-final-source-security.log`, preserving all 119 pinned
  applied source migrations. The Node test runtime emits an experimental
  localStorage warning; it is not a browser-storage verification result.
- A rollback-only native probe initially selected the `authenticated` policy
  group, which lacks direct Fieldbook table grants. No grants were widened to
  hide this. Read-only inspection identified `release_app` as a non-superuser,
  non-bypass role with the expected existing table privileges and membership.
  The next probe reached native revision allocation, then the verifier compared
  JSON text in different key orders. That verifier now uses structural equality
  so every raw value is still checked. Both attempts rolled back.
- The corrected guarded native probe has **not run**: automatic approval review
  disconnected before execution. The owner was asked whether to retry that
  approval. There is no passing final SQL migration/permission/rollback claim.
  `.cache/fieldbook-delivery/verify-schema-rollback.mjs` remains the exact guarded
  probe, scoped to the inspected marked source-test container/database.
- Independent read-only `state-read-only.json` / `state-read-only.log` and
  `originals-read-only.log` in `.cache/fieldbook-delivery/` confirm 119 applied
  records, no installed receipt table/sequence/revision column, no surviving
  native fixture user/project, one original native book and two unchanged raw
  captures/archives. The restored book still matches its previously inspected
  JSON data. These reads do not substitute for the corrected native write test.
- `.cache/fieldbook-recovery-runtime.log` confirms production/supporting service
  health and one application. Backup completion remains `2026-10-20T02:00:03Z`,
  archive/header evidence only. No production build, migration or promotion was
  performed in this checkpoint.
- The owner-authorized Chrome access retry works. A fresh reload initially
  timed out in browser observation, then showed the retained saved book in the
  ordinary selector. Reopening it restored both exact readings, remarks and
  original references. It did not automatically reopen the active book; the
  account/project confirmation alert persisted. This is saved-book recovery
  evidence only, not delivery/reconciliation of the pending local operation.

## Work required before activation

1. Finish the corrected native SQL probe, then verify migration compatibility
   and authenticated HTTP concurrency/replay, silent insert/audit failures,
   revocation and exact rollback cleanup on the marked test stack. Customer
   migration/backup/candidate/rollback acceptance remains separate.
2. Move the page and both immediate/queued saves to the versioned authority;
   refuse legacy generic Fieldbook mutations when that path is ready. Keep old
   device records available for explicit inspection/export/review. Never attach
   a freshly fetched revision to stale queued work without comparison/review.
3. Durably retain actor/project/request identity and the exact request before
   dispatch. Completion must compare the current device operation/snapshot;
   an older acknowledgement cannot clear or replace a later edit. Competing
   editor ancestry and remount recovery need explicit handling, not clock order.
4. Make the pending-book inventory, retry eligibility, ownership, unknown
   baseline/conflict state and exports visible through ordinary UI. Reconcile
   the retained empty copy/pending operation without deleting unknown work.
5. Verify storage/account limits and journal retention/costs for full prior/new
   snapshots, ordinary saved-book access, quota/multi-tab/device/reconnect and
   field acceptance. Delivery proofs still need binding into computation,
   control/design revisions, measured QA and deliverables; the full engineering,
   paid-lifecycle, signing-key and release gates remain open.

## Client retention continuation (source only)

`deliveryClient.ts` now validates the complete server receipt against the
retained actor, request, raw payload, baseline and saved revision. A returned
book ID alone cannot acknowledge delivery. Replays may report a newer current
revision while retaining the original saved snapshot. Every HTTP request uses
the retained-owner precondition; account changes cannot silently reassign work.
Input and returned snapshots are copied before asynchronous work, and invalid
runtime numbers are refused before serialization could turn them into null.

`bookDeliveryJournal.ts` retains exact requests before explicit dispatch in the
new `metardu-book-delivery-journal` IndexedDB database. A strict read/write
transaction prevents two different payloads from claiming the same request key.
No request is coalesced, deleted, rebound to a fetched baseline or marked
delivered by a retry count. Acknowledgements attach only to the unchanged exact
operation, leaving later edits separate. Concurrent retry responses retain the
highest observed current revision rather than replacing it with an older one.
Unreadable requests remain stored and cannot be sent or falsely acknowledged.
No existing legacy stores are migrated, erased or automatically dispatched.

The page, generic queue and writer have **not** been connected to this journal.
This is required client authority for the migration, not an activated recovery
repair. Editor ancestry, explicit review of unknown/stale baselines, visible
pending/conflict/export inventory, quotas, retention costs and generic-writer
closure remain required before activation. Neither a timestamp nor an
acknowledged old operation authorizes a new edit of a later server revision.

Evidence: `fieldbook-delivery-client-red.log`,
`fieldbook-delivery-journal-red.log`, `fieldbook-delivery-journal-race-red.log`
and `fieldbook-delivery-journal-raw-red.log` under `.cache/` record reproduced
failures. A return-value regression also caught stale retry metadata reaching
the caller after the newer revision had already been retained. The final
combined run in `fieldbook-delivery-client-verified-tests.log`
passed 50 tests in five suites, including 27 new client/journal cases. The
journal tests use `fake-indexeddb` 6.2.6 through the real `idb` adapter, with
concurrent transactions, closed/reopened connections, quota faults, payload
tampering and delayed responses. This dependency is development-only; its
in-memory transaction tests do not prove disk persistence, eviction resistance,
browser crashes, actual competing tabs or physical-device recovery.
Application/test typing, scoped lint and security results are in the adjacent
`fieldbook-delivery-client-verified-{types,lint,security}.log` files. All 119 applied
migration pins remain intact. Node 26 emits the existing experimental
localStorage warning; dependency installation also reported the existing
`better-sqlite3` Node-engine mismatch. No native SQLite or production packaging
acceptance is inferred from these source checks. Production runtime verification
passed again without changing services; the native rollback probe approval,
migration, authenticated HTTP concurrency and final release gates remain open.
