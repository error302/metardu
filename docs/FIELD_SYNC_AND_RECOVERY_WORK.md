# Field sync and recovery continuation

This follows the healthy `80940bf7` import release. The prior goal turn was
progress: an additive production repair, complete live checks and independent
cleanup. The full goal remains active. The user chose computer-browser testing;
do not resume physical-phone work without new steering.

## Verified gaps and work order

1. The live catalog confirms 15 legacy `/api/fieldbook/sync` INSERT columns do
   not exist in `survey_points`. Offline `fieldBookDB` callers therefore cannot
   deliver through that endpoint. Repair raw observation delivery using existing
   `survey_observations` and immutable observation-batch capture receipts; do not
   manufacture reviewed points or change applied SQL. Test actual SQL, NULL/zero,
   replay, conflicts, denied membership, partial-write rollback and acknowledgements.
2. FieldSession currently subtracts a global sync count and its badge expression
   cannot mark pending measurements delivered. Use the exact acknowledged IDs,
   scoped to the session/project, and preserve pending entries on failure.
3. Mobile sync paths clear queued records after an upsert with no returned row.
   Require actual returned client/record IDs before removing local work.
4. Shared error recovery uses React reset even for a rejected chunk/module load.
   The production-loopback case recovered only through a normal full reload.
   Offer an explicit reload for asset errors without automatic loops or clearing
   IndexedDB, caches or the user's drawing. The original network cause is still
   unestablished; public HTTPS pages hydrated. Do not relax CSP as a guess.
5. AppUpdateBanner listens for controllerchange on a worker instead of its
   container and forces a timed reload. Make updates deliberate and activation
   handling correct, without discarding open field work. Reconcile skipWaiting.
6. Offline connection retry uses authenticated `/api/compute`. Use public health
   with a timeout and observable result; online events alone are not delivery
   proof. Complete offline cold-open/reopen and owner-safe data recovery remain
   functional requirements, not satisfied merely by changing marketing copy.

## Boundaries

Work in the existing checkout and source preview. Preserve production data,
original hashes, supporting services and the localhost training drawing. Finish
source/native/browser checks before a consolidated candidate promotion. Source
and simulated network/SQL proof never replace a disconnected-browser or field
test. Account ownership, raw capture, reviewed points, QA and approval are
distinct. Keep existing records recoverable; never guess their missing owner,
CRS, datum, zero values or instrument quality.

Current read-only schema evidence is `.cache/field-sync/live-contract.json`.
Production has the canonical 37 observation columns and SELECT/INSERT privileges;
observation-batch compatibility was established by the preceding live repair.

## Current source checkpoint

The raw-delivery replacement and migration 114 are implemented in source, not
production. Rollback-only native checks now cover personal/firm role boundaries,
revoked creator access, zero/unknown source fields, immutable receipts, stable
replay and partial-write rollback. They leave the 118-entry synthetic ledger and
original row fingerprints unchanged. Existing restrictive organization policies
were inspected and retained; unknown permissive policies still reject migration.

Mobile observations share the receipt path. Device records retain exact IDs and
a content-bound receipt; historical timestamps alone are unconfirmed. Photo and
point metadata need matching returned rows before queue removal. Unknown queue
types/actions are retained for recovery. Five real regressions reproduce against
the previous queue implementation without replacing the source checkout.

Pinned source `9deb15a6ce14e00207c3237263190aaeea66fb6f` now passes **24 real
HTTP/PostgreSQL checks** against the existing preview, including normal sign-in,
private receipts, NULL/zero measurements, independently calculated content hash,
concurrent replay, content/uploader conflicts, viewer denial, surveyor delivery,
project-scoped keys, old-row preservation and actual rollback after silently
skipped observation/capture/audit writes. This is source evidence only.

Migration 114 applied through the normal runner **only to the marked synthetic
database**. It now has 119 matching ledger entries; all prior hashes and checked
original row fingerprints were preserved. Its recorded checksum is
`b6af0035a6d81ca9f5dd14b667b711d4b24ac81465de148f009ac8416b25b50d`.
Do not edit this applied migration. The preliminary rollback-only native test
requires a 118-entry baseline and must not be rerun unchanged on the now-119-entry
database. A fresh pinned temporary synthetic upgrade remains a release gate.

Independent post-checks confirm zero exact QA users, projects, raw observations,
captures and points; all three exact fault-injection triggers/functions are absent.
The source checkout was preserved during the previous-version regression run.
Strict application/test typing, focused lint and **44 tests in six suites** pass.
Receipts: `.cache/field-sync/http-attempt-1.json`, `independent-post-check.json`,
`queue-red-proof.json`, `queue-before-repair.log` and `rollback-native.json`.

The archive is the complete normalized JSON record delivered by the client, not
an original NMEA/serial transcript or certified field evidence. Receipts and raw
row immutability do not approve project points, instrument quality or geometry.

## Current live and release boundary

Read-only production inspection confirms healthy release `80940bf7` still has
**118 entries**, with 114 unapplied. Its legacy fieldbook-sync endpoint remains
the verified blocker until the source repair is built, reviewed and promoted.
No production migration, image replacement or customer-data change was made in
this continuation. The production release guard intentionally still rejects
unreviewed pending 114; do not waive that gate to deploy this checkpoint.

Finish the remaining recovery/offline source work, actual schema/privilege and
fresh upgrade proof, pinned checks, backup/recovery review, consolidated build,
promotion and live field-delivery acceptance before claiming this repair live.
The user's training drawing/storage and the one existing app/required services
remain protected. Physical-phone testing was not resumed.

## Remaining functional acceptance

Old unreceipted server rows need an explicit reconciliation workflow; no existing
source is overwritten or automatically adopted. Complete evidence-event timeline
integration, owner-safe offline cold open/reopen, batch delivery/backoff for large
or rejected queues, field UI/browser acceptance and physical field proof remain
open. An old rejected capture must not drive a continuous two-second retry loop.
These are internal work items, distinct from payment, email-provider, receiver,
design-approval and ChatGPT notice/deployment/consent gates.
