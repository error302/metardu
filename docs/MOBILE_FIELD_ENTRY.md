# Mobile field project entry

Source continuation, 21 October 2026. Production has not been promoted.

CUA rendered `/mobile/field` on the owned `127.0.0.1:3021` origin with no selected
project. It showed "Unknown Project" and offered new readings; source inspection
also showed that the delivery schedule started, although saving required a project. Operators had
no project-selection path on this screen. The global fallback back link also
targeted `/mobile`, which has no page in this checkout.

The collector now uses the existing account-scoped project picker before mounting
capture, local observation reads or auto-delivery. Selection retains other query
parameters and opens the chosen project. Changing account remounts the picker;
ordinary signed-out access retains the existing sign-in gate. The navigation
fallback for mobile subpages now leads to the dashboard.

Without a connection, ordinary project selection explains that the list requires
a connection and existing device records remain retained. An explicit "Retry
project list" action reloads the list when the connection returns. Road-plan
offline behavior remains a separate existing option. This change does not claim
private offline cold-open support or adopt a cached project/owner automatically.

## Verification boundaries

The missing-project, inappropriate road-only message and unavailable reconnect
retry were reproduced in focused component tests before their fixes. Receipts:
`.cache/mobile-project-entry-red.log`, `mobile-project-picker-red.log` and
`mobile-project-reconnect-red.log`. Final source test, type and lint receipts use
the `mobile-project-entry-` prefix under `.cache/`.

CUA confirmed the original entry defect. Reloading initially timed out and the
compatibility tab binder failed at its CDP focus command. The documented
`Browser.tabs.get` and DOM/screenshot interface subsequently worked on that same
tab. The new picker rendered, its dashboard back link was present, and ordinary
selection of the existing explicitly labelled simulation project opened the
collector with its correct project name and zero pending records.

Opening recovery then exposed an actual transport timeout presented as the raw
message "signal timed out". That is a separate feedback/retry defect; an empty
recovery inventory has not been proved by that failed request. Capture, export,
account-switch and disconnected-device acceptance remain separate requirements.
No new reading was added or existing source replaced. The user's localhost CAD
drawing was preserved; browser storage was not written through automation
internals. Resume CUA on the existing owned QA tab rather than creating
replacement preview containers or populating observations through internals.

The follow-up normalizes failed access-check requests into actionable connection
and account guidance, retains device sources, and offers "Retry recovery". That
action reloads an authorized inventory; it never resubmits a review automatically.
Two regressions reproduced the exposed timeout text and missing retry control in
`.cache/recovery-timeout-red.log`. The final combined run passes **130 tests in
19 suites** in `.cache/mobile-project-entry-final-tests.log`.
Strict application/test type checks, changed-file lint, the security/migration
invariant gate and `git diff --check` passed. The corresponding logs use the
`mobile-project-entry-types`, `-lint` and `-security` names under `.cache/`.

The existing tab's subsequent reload completed, but the next recovery-button
click timed out at the browser input command. Its outcome is unconfirmed. This
does not establish a successful empty inventory or repaired network transport;
actual browser recovery/retry acceptance remains open.

Complete actual selection, capture, account switching, offline/reconnect and
recovery/export UI acceptance before the final candidate is promoted. The native
recovery API evidence in `LEGACY_DEVICE_RECOVERY.md` is a separate gate.

## Relationship to Fieldbook

`/mobile/field` captures individual raw device observations, photos and delivery
receipts. `/fieldbook` organizes named leveling, traverse and control books and
uses existing engines for calculations and exports. Both currently offer mobile
capture, but syncing the collector does not automatically populate a saved book.
Connecting those retained raw sources to reviewed, source-linked book rows is
still required; do not invent setup values or overwrite original captures to
make the two views appear connected.
