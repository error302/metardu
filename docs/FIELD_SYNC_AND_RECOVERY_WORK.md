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

## Recovery source checkpoint

Items 4–6 now have source repairs. Asset-load errors offer a deliberate full
document reload; ordinary errors retain React retry. Neither path clears the
device database, cache or drawing. The original production-loopback chunk-error
cause is still unresolved.

Update observation now includes an already-waiting worker and late registration,
cleans up listeners, and waits for the requested worker's activation. Timeout,
redundancy, cancellation and messaging failure leave the document open with
feedback. No timer forces a reload. The prompt asks the operator to save work in
all open METARDU tabs. PWA options now disable reconnect reload, default start-URL
caching, automatic skip-waiting and client claiming in the actual supported
option locations. Navigation uses NetworkOnly with an explicit public `/offline`
fallback; it must never cache private HTML or APIs. The generated worker and
multi-tab/offline behavior still require candidate-build/browser acceptance.

Connection help checks uncached, credential-free `/api/public/health`, validates
the health result, times out, coalesces requests and cancels on unmount. Online
events check service without navigating. Help opens in a new tab from the offline
indicator. Unsupported promises of automatic delivery and universal offline
availability were removed; complete owner-safe offline reopening remains work.

Computer-browser source checks at 1280px and 390px verified Geist body typography,
no horizontal overflow, observable failure while the preview compiled, then
successful service recovery without navigation. Screenshots are
`.cache/field-sync/recovery-desktop.png` and `recovery-narrow.png`.
The mobile page header says Connection help rather than asserting Offline.
The preview has PWA disabled: these are source layout/HTTP checks, not a
disconnected production browser or field test.

Behavioral regressions reproduced before repair (five failures plus an ordinary
error-retry pass, and a separate existing-waiting-worker failure). The combined
source suite passes **64 tests in ten suites**, including 20 recovery tests.
Application and test typing pass. Focused lint identified one prefer-const warning
which was corrected; no production change is implied by these source results.
Receipt: `.cache/field-sync/recovery-and-delivery-tests.log`.

## Bounded fieldbook delivery source checkpoint

The legacy IndexedDB fieldbook queue now sends at most 20 readings per pass.
Transient delivery failures use persisted exponential delays (30 seconds up to
15 minutes); valid server Retry-After dates/seconds can require longer. A 429
pause applies across queued projects and cannot be bypassed by a manual click.
Connection failure or server overload ends that pass, retaining later records.
HTTP validation, access and conflict errors pause that record for explicit
review/retry; an invalid receipt also stays pending. Successful acknowledgement
clears only transport retry metadata. Its exclusion from both client/server
raw hashes is checked independently; original readings and their IDs remain.

The road/field collector now uses one stable initial/30-second schedule instead
of scheduling another two-second attempt whenever syncing state changes. Timer
tests verify that failed completion does not re-arm the loop, busy/empty sessions
do not send, later captures join a pass, and cleanup removes both timers. Manual
Sync remains available, and the sync panel displays rejection/deferred feedback.
The legacy hook's manual action also explicitly retries reviewed blocked rows.

Three queue regressions reproduced against the preceding source (uncapped pass,
immediate retry and repeated conflict delivery). Final checks pass **81 tests in
12 suites**, plus strict application/test typing. Recovery lint is clean; final
retry-source lint is recorded separately in `.cache/field-sync/retry-policy-lint.log`.
Receipts: `retry-policy-red.log`, `retry-policy-green.log`, and
`recovery-and-delivery-final-tests.log` under `.cache/field-sync/`.
These new timing/batch checks use the source queue with simulated HTTP responses,
not a disconnected production browser or instrument. The separate mobile queue
still needs bounded large-queue/provider-backoff acceptance. Existing SQL 114
and its applied synthetic checksum were not modified.

Pinned source `d1bb179aec2abe08b72f6d0571295999de53d674` subsequently passed all
**24 signed-in HTTP/PostgreSQL checks** on the existing marked preview database.
No migration was needed: its 119-entry ledger and original checked rows/hashes
were unchanged. Exact fixtures and three fault-injection objects were removed,
then independently checked absent. The refreshed independent report still finds
production `80940bf7` at 118 entries with 114 unapplied. Runtime verification
passes for the one production app and all required supporting services.
Receipts: `.cache/field-sync/http-attempt-2.json`, `independent-post-check.json`,
and `runtime-after-recovery.log`. The owned source preview was temporarily
paused for memory during final checks, then restored in place on 127.0.0.1:3021;
its public health check returned 200/healthy. Production was never paused.

## Outstanding functional acceptance

The release path now includes a strict pre/post raw-field schema/privilege/RLS
contract, a restrictive-policy digest comparison, and observation/photo row
fingerprints. Planning can recognize reviewed 114, but a build still requires a
pinned, normal 118-to-119 synthetic upgrade matrix: canonical and additional
restrictive policies must pass native recording/replay/revocation/immutability
checks; unknown permissive policies and disabled RLS must reject atomically.
The new `scripts/verify-field-sync-upgrade.mjs` uses only a fresh, exactly marked
temporary database in the existing rehearsal service and removes its exact
database/runtime role. Applied 114 is unchanged. Execution of this new matrix,
pinned source checks, generated-worker acceptance and consolidated promotion
remain required; supporting guard/contract unit tests alone are not that proof.

Old unreceipted server rows need an explicit reconciliation workflow; no existing
source is overwritten or automatically adopted. Complete evidence-event timeline
integration, owner-safe offline cold open/reopen, separate mobile queue scaling,
final field UI/browser acceptance and physical field proof remain open. The
fieldbook rejection loop is repaired in source and still needs release acceptance.
These are internal work items, distinct from payment, email-provider, receiver,
design-approval and ChatGPT notice/deployment/consent gates.
