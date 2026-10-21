# Revision-bound Fieldbook delivery — source checkpoint

Status: the authority, page and recovery integration are source work. New saves
use retained edits and revision delivery; generic Fieldbook writes are refused.
Migration 115 has not been applied
persistently to the marked test database or promoted by this checkpoint. The
retained local pending operation is not reconciled or claimed delivered.

## Problem and intended behavior

The replaced `persistFieldbook` staged device data, sent a generic upsert and
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

At the initial authority checkpoint the legacy writer was unchanged. The
connected-source continuation below replaces that path and closes generic
Fieldbook mutation. Native migration and runtime acceptance are still required
before promotion; source wiring is not an activated production recovery repair.

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
2. Verify the connected page and both immediate/queued saves against the native
   versioned authority and generic mutation refusal. Keep old
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

At this client-retention checkpoint the page, generic queue and writer had not
been connected. The next section records their source migration. Quotas,
retention costs, native and browser acceptance remain required before activation.
Neither a timestamp nor an
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

## Connected page and recovery continuation (source only)

The page now saves through `persistWorkingBook`. An immutable working edit is
retained before the saved-book cache or HTTP delivery; a failed cache update
cannot erase its recovery record. Repeated saves of the same open snapshot keep
the request identity. A later edit explicitly references its retained parent.
The new `metardu-book-edits` store retains that ancestry before a parent delivery
has been confirmed; it does not manufacture a revision from the latest server
timestamp. Dispatch walks the retained ancestry and uses only the parent's saved
revision, with at most twenty delivery attempts per branch. A newer server
revision returned on replay cannot rebase the child; ordinary conditional save
will require review. Unknown legacy baselines remain durable without mutation.

The page's Device recovery panel lists retained edits and known legacy queued
books, reports delivery separately, retries exact requests and exports individual
raw snapshot JSON or the scoped device archive. Unreadable owned legacy records
remain counted and exportable. A server comparison presents both complete
payloads and requires explicit review before opening local content against that
revision. It creates a new edit without deleting older work. Users may also
continue a retained copy as a separate draft. This does not mark a legacy queue
operation reconciled or discard it; explicit receipt-bound legacy reconciliation
remains open. Corrupt requests fail closed and keep an archive export path.

Ordinary saved-book opening pairs a fetched revision with that fetched payload,
never with an older listing. Device entries reopen their exact retained edit.
An unapplied revision schema allows retained content to be viewed with a visible
unknown-baseline warning; permission refusal is not converted to success.
Account/project and concurrent-edit checks protect the current open book. The
project and saved-book list reads also carry the checked-account precondition,
so a later session switch cannot silently populate the old workspace with the
other account's inventory. The
existing observation/source snapshots remain separate from editable values.

Generic `/api/db` Fieldbook insert/update/upsert/delete now refuse before a DB
query. Legacy automatic and compatibility sync keep their records without
dispatch, deletion, clock-based merge or generic conflict resolution. The old
ID-only save and destructive coalescing staging path were removed. This requires
coordinated migration/candidate promotion; do not deploy the client with an
unverified or absent revision service and describe its device saves as delivered.

Reproduced red evidence includes `fieldbook-edit-ancestry-red.log`,
`fieldbook-working-save-red.log`, `fieldbook-opening-red.log`,
`fieldbook-recovery-ui-red.log`, `fieldbook-recovery-unknown-red.log`,
`fieldbook-generic-gate-red.log`, `fieldbook-legacy-queue-red.log` and
`fieldbook-save-snapshot-red.log` in `.cache/`. The last catches a caller changing
data during retention and attaching the older request ID to different cached
data. The cache now retains the same copied snapshot.
`fieldbook-read-owner-red.log` reproduces list reads losing the checked-account
precondition; the page now binds those reads at the actual client boundary.

Final source results are recorded in `fieldbook-connected-complete-tests.log`,
`fieldbook-connected-complete-types.log`, `fieldbook-connected-complete-lint.log`
and `fieldbook-connected-final-security.log` (119 pinned applied migrations).
The combined affected run contains 115 checks across 13 suites. The final
snapshot and checked-owner lint follow-ups are
`fieldbook-connected-snapshot-lint.log` and `fieldbook-connected-owner-lint.log`.
These include the actual page handlers with mocked external storage/API,
component interaction, real `idb` adapter/in-memory transaction tests and mocked
server-query tests; they do not prove the native migrated HTTP flow.

The first runtime inventory passed with the backup completed at
`2026-10-21T02:00:03Z` (archive/header only). During follow-up the environment
changed: CUA reports local browser use disabled in Work settings, the marked
synthetic DB port `127.0.0.1:55433` refuses connections, and approved host Docker
inspection cannot find the engine pipe. No service/settings were changed or
restarted. Current runtime health and a fresh original-data preservation read
are therefore unconfirmed; earlier evidence is not presented as current proof.
Migration 115 remains unapplied by this work. The native rollback probe approval,
database availability, browser reload/multiple-tab/quota/eviction/device checks,
editor conflict acceptance, legacy reconciliation, bounded journal retention,
backup restore and full release/engineering/paid-lifecycle gates remain open.
