# Mobile field capture and delivery

Source continuation: 20 October 2026. The broader goal in `PRODUCTION_GOAL.md`
remains active. This increment is not a production promotion or field acceptance.

## Reproduced problems and repair

`mobile/syncService.ts` attempted every pending queue item, continued after a
connection failure/server overload, discarded HTTP retry instructions and retried
rejected observations automatically. Capturing another reading called
`forceSync`, which reset all previously failed records. Two browser tabs could
also read and upload the same pending item without an atomic device claim.

The collector now reads/delivers at most 20 due records per pass. A cursor avoids
materializing the entire pending photo queue. Transient failures use the existing
30-second exponential policy, capped at 15 minutes; a longer server Retry-After
is preserved. An IndexedDB pause survives reloads and applies across projects,
background passes and manual retries. Another failure cannot shorten it.
Authentication failure ends the pass. Validation/access/conflict failures and
invalid success receipts remain held for explicit review; unrelated records can
continue after a record-specific rejection. Failed transport does not permanently
exhaust a three-attempt limit.

Each upload checks the shared pause and then claims a still-pending, due item in
one queue read/write transaction. Existing interrupted-claim recovery retains
its 15-minute lease. The pause check and queue claim use separate databases;
another tab can start a pause after the check. This does not cancel claims or
uploads already in flight. Raw receipt identity/content checks and original observation/photo payloads
are retained. Retry state is stored on the queue entry, outside the raw capture.
Photos have a 60-second upload timeout; observation delivery retains its existing
15-second timeout. Storage and database-proxy failures retain HTTP status and
Retry-After, including non-JSON rejection responses.

Two further regressions demonstrated that device updates and removals resolved
on request success even if the IndexedDB transaction subsequently aborted. Those
operations now acknowledge only transaction commit and reject abort/error.

New captures use ordinary sync without resetting blocked records. A committed
capture followed by delivery/refresh failure is reported as saved on the device;
it is not reported as a failed capture. The UI shows records needing review,
delivery/pause feedback and a last-delivery timestamp only after acknowledgement.

## Retained mobile measurements

Review of that same collector found that its save mapping dropped traverse
distances/vertical angles and levelling BS/IS/FS readings, assigned instrument
height to the target-height field, and never retained the complete form row.
Its instrument pull also put latitude into bearing and longitude into slope
distance, discarded measured zero E/N and rounded coordinates before capture.

New records retain exact original form strings with a form version and survey
mode, alongside finite distance/vertical-angle/BS/IS/FS values and distinct
instrument/target heights. Invalid non-finite inputs are refused before saving;
unknown blanks stay unknown. Explicit traverse/levelling identity and the original
form survive the content-bound server request. Control retains its actual mode
with an unspecified server survey family rather than inventing another family.
The existing receipt archive retains passthrough fields even when they have no
dedicated SQL column; no applied migration or older raw record is rewritten.

The form does not declare a bearing encoding, so entered bearing text remains
in `rawForm` and is not silently interpreted as a decimal horizontal angle.
Instrument coordinates stay in coordinate fields and retain their numerical
precision. The form snapshot is manual entry/confirmation, not proof of an
instrument connection, original serial transcript, verified CRS or field quality.
Dedicated convention/provenance and computation review remain acceptance work.

## Device schema compatibility

The existing `MetarduFieldDB` remains at version 1, with all existing stores,
keys and payloads retained. A separate `MetarduFieldDeliveryState` version-1
database contains only transport timing. An earlier source design adding a
store/version to the field database was revised before release because the
current production/rollback code explicitly opens field database version 1.
There is no SQL migration, customer-data copy or new dependency. A blocked open
asks the operator to close other field tabs and retry; new connections close on
versionchange. Real metadata creation/reopen, old-client rollback reopening and
interruption proof remain required before release; simulated IDB tests are narrower.

## Verification and remaining boundaries

Seven pacing regressions failed against the preceding implementation, including
25 uploads in one pass, repeated requests after interruption, ignored 429/503
Retry-After, automatic retries of rejected/unconfirmed records and competing
tab uploads. All seven pass after repair. The two storage commit/abort regressions
and three mobile feedback/save regressions also failed before their repairs.
Four further capture regressions reproduced the lost readings, height mapping,
invalid-number acceptance and coordinate/angle confusion. A separate precision
regression reproduced rounding `0.000001` and `0.000009` to zero on pull.

The final combined focused run passed **78 tests in 11 suites**, covering mobile
delivery/storage/recovery/photos, mobile page behavior, shared retry policy,
browser database-client behavior, the existing fieldbook delivery path and raw
server capture. The raw-archive check verifies original mobile form strings,
distinct heights and levelling readings against the content-bound receipt.
Evidence is retained under `.cache/` as `mobile-sync-red.log`,
`mobile-sync-storage-red.log`, `mobile-sync-ui-red.log`, `mobile-capture-red.log`,
`mobile-capture-precision-red.log`, `mobile-sync-metadata-tests.log` and
`mobile-sync-final-tests.log`. These are source tests using simulated transport
and IndexedDB transaction events, not real disconnected-browser or field proof.
`npm run typecheck` passes both application and test projects. Scoped
`git diff --check` passes; Git emits the checkout's normal CRLF notices.
Changed-file ESLint passes for all 13 mobile/UI/client files and the additional
server-archive test. The first lint pass identified non-null assertions and an
untyped test-call access; both were repaired and the final checks pass.

The CUA browser inventory and existing-source-browser selection both timed out
before returning a usable session. No browser storage/state was written, no
training drawing was changed and no replacement browser/runtime was started.
Visual, actual multi-tab/metadata persistence, rollback reopening, disconnected reload, quota, photo-volume,
account-switch and physical-controller acceptance remain open. The failed-item
manual-reset/statistics paths still require large-job memory/latency review.
Owner-safe private offline reopening and legacy reconciliation remain separate
functional work; this increment does not establish those guarantees.

Production services, images, database, signing configuration and customer data
were not changed. The known signing-key rotation remains explicitly deferred
by the owner. Consolidated source/build/recovery and live acceptance gates must
pass before any production-readiness claim.

## 24 October large-job storage continuation

`MOBILE_LARGE_JOB_STORAGE_2026-10-24.md` records source repairs for the remaining
manual-reset/statistics paths: atomic twenty-record retries, streaming counts,
fifty-record observation batches, the collector's ten most recent captures,
shared version-1 initialization and explicit unknown/read-failure states.
123 focused tests in fifteen suites include fourteen emulated IndexedDB cases.
The separate full fieldbook observation/photo listing still needs bounded UI
work, and emulated transactions do not close real browser, quota, controller,
offline reopening, rollback or release/field acceptance.
