# Captured readings to source-linked Fieldbooks

Continuation of the production goal, 21 October 2026. Work in progress; no
production promotion, customer migration or field acceptance is implied.

The mobile collector retains individual raw observations and content-bound
capture receipts. Named Fieldbooks retain editable survey-book rows. The intended
connection is deliberate source inspection and creation of a new draft, retaining
the original raw observations rather than overwriting or silently adopting them.

## Required behavior

- List a bounded, paginated inventory of delivered project captures; inspect one
  retained source at a time. Require current authenticated field-recording access
  and refuse account switches before reading or writing. Pending device captures
  remain on the device until acknowledged delivery makes their archive available.
- Create from selected capture IDs and hashes, not client-authored source rows.
  Verify the raw archive hash, linked native observation hash, project and capture
  authorship. Keep unknown authorship distinct from the current book reviewer.
- Map compatible leveling, traverse and polar control captures. Preserve original
  strings, zero values and every raw field. Missing control, heights, CRS and
  run length stay unknown. GNSS coordinate-only captures are not polar shots.
- Require adopted bearing encoding before interpreting ambiguous bearing text.
  Keep the original in its source snapshot; use the established engine layer for
  declared decimal/packed/separated DMS conversion without intermediate rounding.
- Persist the new book and its source-import audit in one server transaction.
  Replaying the same creation key returns the existing book, including later
  edits. A different request cannot overwrite it. Missing acknowledgements and
  audit failure cannot report successful creation.
- Preserve the open book before creation, and do not replace edits made while
  the request is pending. Keep source snapshots through save/reopen, JSON
  import/export, editable rows and CSV/PDF source references. Portable references
  are not fresh server verification, field proof or professional approval.
- Expose ordinary UI review, selection order, explicit draft acknowledgement and
  recovery of unconfirmed creation. Show source references beside the book and a
  project-scoped link from the collector. Do not seed browser storage internally.

## Source checkpoint

The source review panel is connected to Fieldbook on desktop and mobile. The
collector links to the selected project's book workspace. Opening a created book
first preserves the current book and checks that the owner, project, book ID and
editable snapshot still match after the request. Later edits stay open; the
acknowledged new draft remains available in saved books. A device-cache failure
does not pretend the server draft was absent. Original references survive book
save/reopen and JSON transfer, and are displayed separately from editable rows.
CSV includes reference columns even when its first row has no attached source;
PDF includes a source-reference appendix. Neither is a full raw-source backup.

Unknown run length no longer falls back to 1 km. The established leveling engine
can compute levels without evaluating a distance-based tolerance; the UI shows
the missing run length or closing RL instead of NaN or a zero tolerance.
Timed-out account/project loading offers retry without replacing the open book.

## Verification work

Mapping regressions first failed in `.cache/capture-book-mapping-red.log`; six
mapping checks subsequently passed. Server transaction and API boundary tests
were added before implementation. Complete source typing/lint, meaningful
client/component/persistence checks, native HTTP/PostgreSQL creation/replay/role/
rollback tests, exact synthetic cleanup, ordinary CUA review and release/device
acceptance. The production goal remains active.

Current focused source evidence: `.cache/capture-book-final-tests.log` has 56
checks in 12 suites, including actual page draft handoff, edits during creation,
project switching, cache failure, malformed/cross-project portable sources,
account-request retry, JSON retention and missing-distance behavior. Earlier
`.cache/capture-book-unknown-level-red.log` reproduced the misleading display.
The initial page harness failed because jsdom has no element scrollTo; its
browser-only scroll method is now mocked. Test-fixture typing was corrected
without weakening the application or transfer schema. Application/test typing
passed in `.cache/capture-book-final-types.log`; after test-only lint cleanup,
the six actual-page checks and test typing passed again in
`.cache/capture-book-page-final.log` and
`.cache/capture-book-final-fixture-types.log`. Scoped Next lint passed, and the
additional ESLint pass found six test-only non-null assertions; these were
replaced with explicit harness guards, and its final pass exited zero
(`.cache/capture-book-page-lint-final.log`).
`.cache/capture-book-security-final.log` passed the security/bug gate with 119
applied migrations pinned. The pinned native report and broader release gates
remain required before readiness claims.

CUA saw the collector's new link and loaded its exact Fieldbook destination on
127.0.0.1:3021. SPA navigation did not visibly complete; direct navigation timed
out at the control layer but later inspection confirmed the destination. The
initial Fieldbook account request also timed out and was incorrectly presented
as signed out, motivating the retry fix. This is not completed authenticated
source selection, book creation, export, or real-device proof. No readings were
added to the existing Pungu simulation project, no browser storage was seeded,
and the localhost CAD drawing was not touched. After the ordinary retry, the
project name and authenticated source-review panel loaded. Its first inventory
request timed out and displayed the retained-work retry state; successful source
selection/creation is still unproven. The pre-existing autosave created an empty
`LEVELING Field Book` (`f02e2f46-c1c5-4c41-891c-6448531b1b2e`) in the synthetic
Pungu project during inspection. It was left intact, not deleted or relabeled.
Avoid creating empty books merely by opening a project in a future UI pass.

## Pinned native checkpoint

At `853c7bcc2051506511fd7e3328ba3866d02dc513`,
`.cache/field-sync/http-attempt-7.json` passed 68 real HTTP/PostgreSQL checks
using ordinary disposable credentials on the one existing marked synthetic
database and source preview. In addition to the raw-capture/recovery regressions,
the run verifies the project-private source inventory, full source inspection,
hash/account/role refusals, exact book insertion and audit, replay preserving
later editable changes, same-ID request conflict and rollback after either a
silent book insert or silent audit insert. Native source/archive values and all
119 applied migration hashes remain unchanged. No new migration was required.

Attempt 6 also passed 68 checks, but review found its new audit fault condition
compared the text record ID with a UUID. That exercised rollback on an operator
error rather than the intended missing audit acknowledgement. Commit `853c7bcc`
corrected the condition; attempt 7 is the authoritative silent-insert proof.
Both runs cleaned their exact entity fixtures and fault functions/triggers.
`.cache/field-sync/capture-book-independent-cleanup-final.json` independently
confirms zero remaining fixture users, profiles, projects, books, raw observations,
captures, reviewed points, fault triggers and fault functions. Audit history is
not erased as part of fixture cleanup.

The ordinary CUA inventory retry subsequently completed: the selected Pungu
simulation project displayed the expected empty-source message. No source
selection/creation, file download or field acceptance is inferred from that
empty-state observation. Production, customer data, applied migrations,
required services and the localhost CAD drawing were not promoted or modified.

## Interrupted creation source checkpoint

The client now retains the fully reviewed creation request before any creation
HTTP mutation. A separate `metardu-capture-book-intents` IndexedDB store holds
only the account/project scope, exact request and checksum, not copied raw
observations. Its read/write transaction requests strict durability and chooses
one retained key for simultaneous reservations. Opening the review panel after
a remount restores that request and offers an explicit retry with the same book
ID, source order and hashes. It never dispatches automatically.

An unreadable/checksum-mismatched intent is retained and refuses a new request.
Storage failure stops the HTTP mutation. Completion compares the entire request
before removing the recovery key; a different retained request cannot be erased.
A competing tab's different request is displayed for review before retrying it.
Only the server's specific post-lookup mapping/size rejection codes allow
correction of a proven absent draft. Access, schema, timeout and other failures
retain the key because they do not disprove a previous unacknowledged commit.

Untouched project entry no longer enables autosave merely because a project ID
loaded. Actual named/setup/reading edits and existing books enable saving, and
preserving an untouched book before source import no longer creates an empty
book. Initial traverse station and instrument/target heights are blank rather
than assumed values. Existing saved books, including the prior empty Pungu book,
are retained.

Regression evidence: `.cache/capture-intent-red.log` reproduced four UI/page
failures and `.cache/capture-intent-storage-red.log` five storage failures before
implementation. `.cache/capture-intent-final-tests.log` passed 68 checks across
13 suites. The storage tests use a serialized IDB transaction model; component
tests simulate remount and uncertain acknowledgements. These tests do not prove
real browser storage, process interruption, physical power loss or multi-tab
behavior. Final typing/lint/security logs are `.cache/capture-intent-final-types.log`,
`.cache/capture-intent-final-lint.log` and `.cache/capture-intent-security.log`;
each exited zero. The initial lint pass found a test-only untyped JSON clone
return, corrected with an explicit generic return type without relaxing lint.
No dependency, customer SQL migration, production promotion or new container is
required by this client change. Fresh read-only production verification passed
in `.cache/capture-book-resilience-runtime.log`, with the same backup boundary.
Final review also reproduced a render failure when a retained row included an
extra non-text metadata field (`.cache/capture-intent-extra-metadata-red.log`).
The content check now ignores such extensions without deleting them or treating
them as measurements. The same 68 checks passed again in
`.cache/capture-intent-verified-tests.log`; final typing, page lint and security
evidence are `.cache/capture-intent-verified-types.log`,
`.cache/capture-intent-metadata-lint.log` and
`.cache/capture-intent-verified-security.log`.

For ordinary browser acceptance, one explicitly synthetic account/project was
prepared on the existing marked source-test database. IDs and ownership are in
`.cache/field-sync/capture-browser-fixture.json`; user
`a3604630-e646-4efa-a3d9-eba6abbb2b4f`, project
`3801daa3-b41f-41be-9a85-1b8c71b531cf`. It has no customer data and was retained
for follow-up acceptance, not claimed as cleaned up. Its first creation attempt
used an unsupported optional project column and rolled back; the retry verified
both planned IDs absent and reused those exact IDs with the established schema.
The existing simulation account was not signed out or given extra entitlements.
Read-only `.cache/field-sync/capture-browser-fixture-inspection.json` confirmed
the exact fixture owner/label, one project and zero books, observations,
captures or points after browser access was blocked.

A separate Chrome login tab was opened so its test account would not replace
the existing in-app session. Before page content could be observed, automatic
approval review failed to grant `http://127.0.0.1:3021` access because its review
connection disconnected. This was an approval-review failure, not a finding
that the page was unsafe. No credentials were entered, no browser storage was
seeded, and no alternate browser/CLI page observation was used to bypass the
rejection. The owner then explicitly authorized retrying Chrome approval; the
same tab's origin approval succeeded and ordinary synthetic sign-in completed.
The acceptance below used that approved tab; no browser storage was seeded or
changed through automation internals.

## Ordinary browser recovery and export acceptance

At source checkpoint `c07e76b9`, Chrome CUA captured two explicitly synthetic
leveling readings in the retained fixture through the normal collector forms:
QA-BM backsight `1.5000` and QA-TP1 foresight `1.2500`. Both reached Synced with
Pending 0. The project-scoped collector link opened Fieldbook; source inspection
and ordered selection retained both exact form strings. Idle project entry
created no empty book. The existing user's in-app session and CAD drawing were
left alone.

To exercise a genuinely uncertain creation acknowledgement, a guarded helper
held only this marked fixture project's row lock, without writing data. After
the UI durably retained creation request `f5cd0427-c8b0-4d21-baf0-ff31a7cdbabb`,
the tab was reloaded before acknowledgement. The helper released its lock and
read-only SQL confirmed that exact book had committed. Reopening the import
panel recovered the same request and ordered sources from real browser storage.
An explicit Retry draft creation opened that book, without a second book or
source reselection. The helper was released and stopped; no lock remains.
`.cache/field-sync/capture-browser-post-reload-before-retry.log` and
`capture-browser-after-recovery-save.log` confirm one exact book, two raw rows,
two archives, zero survey points, and unchanged originals against the retained
pre-creation snapshot. This proves this browser reload/lost-acknowledgement
scenario, not operating-system crash, power-loss, quota or competing-tab proof.

Ordinary edits supplied opening RL `100.0000`, closing RL `100.2500` and run length
`0.125` km. Before the latter two were supplied, their checks showed unevaluated.
The synthetic computed final RL was `100.2500`. The second book remark was
changed, saved and reopened through the saved-book selector. Source inspection
flagged the changed book row and retained its different original remark.

JSON, CSV and PDF were exported by normal buttons. The download-event listener
missed the first blob download; freshly timestamped files were independently
matched to the exact fixture identity/content instead. JSON retains the complete
raw snapshots, blank unknown CRS reference and `fieldVerified:false`. CSV retains
source IDs/hashes/author and `no`/`yes` book-row-change flags. The first PDF
exposed blank leveling remarks and a station-name filter that could drop a real
BM station and shift displayed computed rows. Three regressions reproduced the
PDF/table defects. Export and table mapping now skip only the engine's initial
synthetic benchmark, retain raw precision/remarks and wrap the remarks column.
Twenty focused checks across three suites passed, including both leveling
methods and the engine suite (`.cache/fieldbook-report-green.log`).
The final rerun also passed twenty checks (`.cache/fieldbook-report-final-tests.log`).
Application/test typing passed in `.cache/fieldbook-report-types.log`, with final
test typing in `fieldbook-report-final-test-types.log`. The first lint pass found
two untyped PDF test-mock accesses; the mock was typed without weakening rules.
Final scoped lint exited zero (`.cache/fieldbook-report-final-lint.log`), and
`fieldbook-report-security.log` passed with all 119 applied migrations pinned.

The corrected PDF was re-exported from the browser. Two pages were text-checked
and visually inspected: both notes/readings and the draft source-reference
appendix fit without clipping in this fixture. Full SHA-256 artifact evidence is
`.cache/fieldbook-browser-qa/export-verification.json`; retained review copies
are `export.json`, `export.csv`, `report.pdf`, `report-1.png` and `report-2.png`
in that directory. This is a small synthetic report, not long-report or field
acceptance. The fixture is intentionally retained, not claimed as cleaned up.
The native saved book data also matches the exported JSON data exactly.

Source-preview follow-ups remain: cold loading and intermittent account/source
request timeouts are slow, though open work is retained; a manual sync round
showed "0 records delivered" while the final pending count was zero; the general
QC sidebar shows a zero misclosure independently of the active leveling setup.
These are observed credibility/performance gaps, not production measurements or
resolved findings. The older alternate workspace/report paths also need a
separate acceptance pass beyond the active Fieldbook route exercised here.

## Still required

- Broaden native inventory acceptance to multi-page/equal-timestamp/null-time
  boundaries, concurrent creation and all compatible book types. The current
  native creation exercises a traverse draft; focused mappings cover leveling
  and polar control, but those are not native/browser acceptance for each type.
- Responsive/keyboard acceptance, long reports and other book-type reports.
- Broaden retained-key acceptance to competing tabs and actual storage failure.
  The observed browser reload recovery is not device interruption proof.
- Private offline reopen, multi-tab coordination, quota/reconnect/device/field
  acceptance; source references are snapshots, not fresh archive verification.
- The production goal's engineering chain, signing-key, payment, recovery,
  migration/candidate/rollback and promotion gates remain separate and open.
