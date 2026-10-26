# Road workspace: live inputs and ground association

27 October 2026, Africa/Nairobi. Continues the connected review checkpoint
`ROAD_VISUAL_WORKSPACE_2026-10-26.md` and the complete road delivery target in
`ROAD_WORKSPACE_BENCHMARK_2026-10-26.md`. The production goal remains active.

## Implemented behavior

The existing saved-project visual workspace and its explicitly synthetic worked
example now share a live input editor. Alignment endpoints/PIs, circular radii,
supplied symmetric spiral lengths, vertical tangent-intersection levels and
curve parameters, profile interval and section template values feed the existing
horizontal, vertical, section and quantity authorities. Points can be added or
removed. The editor sits alongside the connected views on a desktop and flows
above them on a phone. Focused views remain available. These are numeric input
edits; direct manipulation of PI/profile handles is not implemented.

Incomplete decimal text is retained as entered. It is not coerced to zero, and
the previous successful plots are removed while the current input is invalid.
Geometric refusals, including out-of-range measured chainages, retain the input
and explain what needs review. Cached geometry, grades, station areas and derived
vertical-alignment target levels are removed from a submitted road draft;
manual targets and original ground observations are retained.

Save calls the existing project engineering-data save path. Only an exact
acknowledgement is reported as saved. Editing and duplicate submissions are
blocked during that call; failure retains the draft. A newly observed saved
source or reference change does not overwrite a dirty draft and blocks its save.
JSON normalization of an exact acknowledgement is accepted. A clean view follows
new saved input. Discard is an explicit user action. Ordinary page links are
held while dirty and full-page unloading requests the browser's native warning.
These protections do not constitute crash recovery, a durable account-bound
draft journal, a database compare-and-swap, or complete browser-back protection.

The public example never writes a project. Reset restores its initial synthetic
values. No customer project or localhost CAD drawing was used for browser QA.

## Ground remains attached to its original alignment

Horizontal edits cannot silently relocate chainage/offset observations. The
editor retains a canonical original horizontal-geometry identity in the optional
`groundSectionAlignmentKey` project-JSON field. It includes CRS, starting
chainage, ordered coordinates/radii and supplied transition lengths. It excludes
names and computed caches. This identity is not a cryptographic signature,
field certification or an assertion that an old unbound draft was surveyed
correctly. Historical drafts without this field retain their existing evidence
limitations.

When that identity differs from the edited geometry, the original observations
remain in the saved project. The connected view can preview the evaluated design
formation, but it withholds ground overlays, ground-based station targets and
areas/volumes. Shared station resolution, current quantity inputs, long-section
ground and affected CSV schedules honor the mismatch. The legacy mirror is not
updated with the mismatched observations. Restoring the exact original geometry
restores the original association; no observations are interpolated or moved to
make the revised alignment appear surveyed.

Independent reassociation or fresh observations for a changed alignment remains
required work. There is deliberately no automatic assertion that existing ground
belongs to the new corridor.

## Server quantity authority

The quantity loader now reads the complete saved project road under the existing
project/alignment lock. For the requested named road, it validates that source
and uses it instead of a potentially older relational mirror. Invalid current
project data is refused, without fallback to old sections. Consequently a
retained ground-association mismatch is also refused by the quantity endpoint.
A separately named historical alignment, or a draft without a project-JSON road,
retains its own relational source. Existing immutable quantity-run retry/read
behavior is retained. This is source/endpoint-fixture proof, not customer DB or
ordinary authenticated saved-project browser acceptance.

## Verification evidence

- New regressions exposed unassociated ground quantities, the long-section
  ground bypass, contradictory disabled transitions, malformed-template crashes,
  normalized save acknowledgement conflicts and the server's legacy-source
  mismatch before their fixes. The focused road and endpoint suite includes
  **184 tests across 26 suites**. See `.cache/road-editor/jest.json`.
- Application/test TypeScript, direct ESLint on the 17 changed TS/TSX files and
  the static security gate are recorded in `.cache/road-editor/source-checks.json`.
- CUA exercised the actual existing source preview at
  `http://127.0.0.1:3021/tools/road-design`. Moving the start easting to 499999
  updated the design coordinate and withheld ground/quantities. Clearing it
  retained blank input and removed stale plots. Reset restored the example.
- Changing the synthetic first VIP RL from 100 to 99 updated the target to
  99.000, cut area to 18.670, cut volume to 1430.233 and fill to 441.336. Changing
  synthetic camber from 2.5% to 3% changed those volumes to 1453.524/431.521.
  These numbers are worked-example results, not field or independent accuracy
  acceptance. Actual WebGL was present.
- Desktop 1600 x 1000 and phone-width 390 x 844 observations found no page-width
  overflow. The focused phone profile used a 346 x 280 viewport with no clipped
  labels. Browser inspection found an adjacent-label focus-ring spacing problem;
  the final reloaded bundle has a measured 12px gap. Screenshots and DOM-backed
  observations are in `.cache/road-editor/`. The viewport override and example
  edits were reset; the review tab remains open.
- Initial `npm run docker:verify` passed with one production application and all
  required services. The existing 26 October 02:00:04 UTC backup remains archive/
  header evidence, separate from a restore. No service was built, started,
  stopped or migrated. Six pre-existing changed/untracked files are preserved
  byte-for-byte in the verification receipt.

## Compatibility and remaining delivery gates

No migration or dependency change is introduced. The new association field is
stored in existing project JSON. Older consumers/writers may ignore or drop that
field: a coherent candidate and rollback compatibility review is required before
promotion, including server quantity-source behavior. No production build, push
or promotion was performed.

Durable account-bound recovery and server conflict handling, direct graphical
editing, exact retained-terrain selection, independently justified ground
reassociation, immutable road-revision delivery, selected-revision IFC/LandXML/
DXF and receiving-CAD/instrument acceptance remain open. Existing IFC first-row
selection and missing-height handling remain unvalidated blockers. Ordinary
saved-project/admin and actual-phone acceptance, multi-crew/ward-scale capacity,
customer clone/restore admission, worker artifact alignment, provider/payment,
owner-deferred signing-key work, independent surveyor/field/print proof and the
coherent production release retain their gates. Preserve Cloudflare containment.

The subsequent conditional-save/device-recovery phase is recorded in
`ROAD_DRAFT_RECOVERY_2026-10-27.md`. It supersedes the owner visual workspace's
page-only draft handling. Legacy write paths, collaboration, terrain, selected
road-revision delivery and broader production/field acceptance remain open.
