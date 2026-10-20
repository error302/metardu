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

## Still required

- Broaden native inventory acceptance to multi-page/equal-timestamp/null-time
  boundaries, concurrent creation and all compatible book types. The current
  native creation exercises a traverse draft; focused mappings cover leveling
  and polar control, but those are not native/browser acceptance for each type.
- Ordinary authenticated CUA selection/creation, editable save/reopen, complete
  JSON/CSV/PDF inspection, and responsive/keyboard acceptance.
- Persist creation intent safely across reloads/device interruption. The current
  panel retries the same key while mounted; its in-memory pending key is not a
  durable crash-recovery receipt. Do not claim reload-safe creation yet.
- Private offline reopen, multi-tab coordination, quota/reconnect/device/field
  acceptance; source references are snapshots, not fresh archive verification.
- The production goal's engineering chain, signing-key, payment, recovery,
  migration/candidate/rollback and promotion gates remain separate and open.
