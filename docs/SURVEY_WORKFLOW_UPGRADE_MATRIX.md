# METARDU survey workflow upgrade matrix

Scope: the user's cadastral, engineering, road, construction and topographical
jobs. This is the continuing implementation/acceptance checklist, not a claim
that a menu item or successful build proves a complete professional workflow.
Upgrade existing tools and connect their saved data before adding another tool.

## Shared field-to-finish contract

Every job must retain project identity, the declared horizontal CRS and height
reference, control/benchmark provenance, instrument/operator details, observation
IDs, raw observations, reductions/corrections, uncertainty and adopted tolerances.
Unknown information stays unknown. Coordinate/level zero is a valid measurement,
not a missing-value sentinel. Calculation results must derive from the current
revision, with units, method, assumptions, full schedules and useful machine files.
Offline capture must retain identity and survive retries without duplicate writes.
Issued work requires control checks, approved design where applicable, field
comparison and the appropriate professional review; a generated draft does not
create legal authority or construction approval.

| Job family | Existing tools/workspaces to upgrade | Complete workflow target | Acceptance evidence still needed |
| --- | --- | --- | --- |
| Cadastral | `/cadastral-workflow`, traverse/COGO, CAD, topology check, subdivision, mutation plan, deed plan, sectional area schedule | Source boundary records and control → observations/adjustment → boundary reconstruction and neighbour/topology checks → subdivision/areas → reviewable plans and coordinate schedules with evidence/revisions | Independent known-boundary fixtures; closure/adjustment/area and topology checks; parser round trips; traceable legal/source boundaries and jurisdiction-specific issue review. The sectional page is now a measured area schedule, not a registrable floor/parcel drawing. A title search or certification must not be simulated. |
| Engineering | Project engineering workspace, network adjustment, level book/two-peg test, drainage, deformation, as-built, reserve and pile/grid panels | Establish/verify control → measured work geometry → approved target/design → set-out → independent checks → as-built/deformation → accountable reports | Route-specific calculation/input/persistence checks, adopted tolerances, actual receiver/instrument tests, and repeat field observations. Hydraulic/pavement screening is not full design approval. |
| Road | Road field plan/collector, horizontal/vertical alignment, station entry, cross sections, earthworks/mass haul, drainage, long section, export | Ordered alignment and chainage → surveyed centreline and offset profiles → approved pavement/formation/slopes → sections/daylights/quantities → set-out/level/profile schedules → as-built comparison | Source now evaluates supplied parabolic vertical designs and straight/simple-circular centreline coordinate targets alongside measured sections. Transition/compound/reverse alignments, full corridor offsets/superelevation, measured-middle-section prismoidal scheduling, design/control identity, curvature/material evidence and field checks remain open. |
| Construction | Setting-out, setting-out sheet/stakeout report, pile grid, drainage, as-built deviation, terrain quantities | Import approved design revision → bind control/CRS/height reference → generate traceable points/offsets/levels → field checks and tolerance assessment → re-observe → as-built/handover | Design/observation identity and version checks; zero/negative-coordinate fixtures; device-format round trips; actual grid/back-sight/level/receiver checks; adopted tolerances, not a universal pass threshold. |
| Topographical | `/topographic-workflow`, topo survey/drawing, point imports, breaklines/TIN, contour generator, cut/fill, exports | Reviewed measured ground/control → coded features/breaklines → bounded terrain → contours and spot heights → plan/key/scale/reference metadata → usable CAD/PDF/data files | The supplied-point-loss and mixed-triangle volume regressions are corrected in source. Fresh browser/native export/print inspection, masked terrain boundaries, exact surface-overlay quantities where required, and independent field/height checks remain open. |

## Current implementation batch — 14 October 2026

Project road outputs now use the shared engineering engine, not formulas in React.
Circular curves use the middle PI's supplied radius, normalized deflection and
route chainage corrections. Missing radii, overlapping tangents, duplicate
coordinates and missing projected CRS block a fabricated result. Existing
transition records are explicitly outside the simple circular schedule; they
must be connected to the established spiral engine in the next alignment pass.

Station entry records design surface RL and measured offset/ground RL profiles,
including zero RL. Both schedule and grouped profile CSVs are supported. Imports
reject incomplete/suffixed values and conflicts atomically, without skipping bad
observations. The complete project JSON is authoritative when the legacy
relational mirror omits design/profile fields. A late mirror response cannot
hydrate a different project. The save notice correctly distinguishes project
storage from the legacy mirror, rather than falsely calling a successful server
save “local.”

The approved crowned road template defines subgrade depth and explicit shoulder
crossfall. The existing project slope convention remains H:V; it is not silently
reinterpreted as the geometry module's V:H convention. Each side uses its own
measured cut/fill condition, and daylight must occur within observed ground.
Separate profile polygons/integration retain mixed cut/fill, with no flat-ground
inference from one centreline RL. All section rows, actual chainage spans,
incremental/cumulative quantities and daylight offsets are shown. The existing
Cross Sections view now renders measured ground/formation instead of redirecting
to another calculator. CSV/PDF exports use the same fresh result and preserve
negative numerical offsets for re-import. Saved vertical rows remain clearly
identified as inputs, not an independently evaluated vertical alignment.

Terrain reference-plane quantities split each TIN triangle at the plane before
integrating cut and fill. The between-surface grid method covers each cell once,
clips residual edge cells, rejects zero/non-finite resolution and enforces a work
limit. It remains a **midpoint-grid estimate**, with spacing and sampled-area
metadata; irregular hull/void boundary cells are not exact overlay integration.

The existing standalone cross-section/earthworks calculator now delegates to the
same measured-profile authority as the project workspace. Its original seven
regressions failed before repair: a hand-calculated 5 m² cut section returned
zero; mixed cut/fill, camber, observed daylight, invalid input, station ordering
and incomplete CSV handling were also incorrect. The repaired adapter retains
all ground and formation vertices and separate cut/fill polygons. The drawing
fits both axes at equal scale and displays the actual crowned formation.
Input changes invalidate displayed/exportable results, incomplete observations
block computation, and blank shoulder/material factors stay unknown.

Standalone volumes now explicitly use average end areas and actual station spans.
The fabricated middle-area/prismoidal comparison and hidden 0.85 factor are
removed. Optional supplied material factors are labelled separately from raw
geometric quantities. Draft print schedules show complete section/volume/mass
tables and optional supplied rates, with unknown references visible, no invented
Nairobi height datum, no asserted universal error percentage, no automatically
selected tax, and no prewritten certification assertion for this draft workflow.
Material suitability, curvature, contractual acceptance, haul routing and field
checks remain unassessed.

## Next implementation priorities

1. Extend the evaluated straight/circular centreline targets to approved spiral
   alignments and corridor offsets/superelevation. Bind design revisions and field
   control before issued set-out; retain the source checks documented below.
2. Run cadastral boundary-to-document fixtures through actual import, adjustment,
   CAD/topology, subdivision and native output parsers; repair the discovered
   failures, retaining original observations and legal/source evidence.
3. Verify and promote the version 2 construction capture migration described
   below, after compatibility and recovery checks. New source captures require
   recorded criteria and separate horizontal/vertical evidence for numerical
   comparison. Verify construction control, design import, stakeout/level checks
   and as-built outputs together; legacy standalone assessment remains separate.
4. Add measured-middle-section quantity schedules where independently observed
   middle profiles are available; require declared material conversion evidence
   and retain explicit method labels. Do not restore invented prismoidal values.
5. Finish contour/terrain browser, native-file and printed-scale checks and the
   wider receiver/offline/field acceptance matrix. Retain separate provider,
   public HTTPS/ChatGPT consent/listing, payment and recovery gates.

Production remains the existing application stack. Source checks precede one
planned promotion, with current rollback, migration compatibility and recovery
review. No duplicate app, new builder, blanket cleanup, customer clone or
applied-migration checksum rewrite is part of this upgrade batch.

## Verification checkpoint

Final explicit-path source run: **411 tests passed across 40 suites**, covering
engineering, drainage, road collection, road inputs/outputs/persistence,
cross-section geometry/rendering, standalone earthworks/print schedules,
topographical terrain/breaklines/contours and contour UI helpers. Both strict
app/test TypeScript projects and ESLint on all modified/new source files passed.
The shared renderer's metre-viewBox/pixel-coordinate defect, incomplete daylight,
duplicate zero-shoulder vertices and stale supplied-area cases were reproduced
before repair. It now uses pixel viewing bounds, rejects incomplete sections,
and verifies supplied areas against the current measured profile. Profile lookup
uses binary search; observation CSV size/row limits and geometry point/work caps
bound the supported operations. No new dependency was installed.

The read-only Docker verifier passed against the existing stack: one production
app, healthy required services, production HTTP/database/Redis checks and a recent
backup completion. It did not build, migrate, start or stop any service. Source
changes in this batch remain unpromoted. Migration 105, verified rollback and
backup/restore review remain release gates; do not rerun the incompatible failed
migration container or alter applied hashes.

The existing source-preview wrapper/processes were confirmed on owned loopback
port 3021 and reused. CUA navigation to `/tools/earthworks` returned
`net::ERR_BLOCKED_BY_CLIENT`; no browser visual/download/print proof is claimed.
No localhost CAD storage was read or changed. Source tests and draft HTML content
checks do not prove live deployment, native downstream imports, physical print
scale, receiver accuracy or full field acceptance for any of the five job families.

Source changes are committed/pushed on the existing
`codex/metardu-workflow-readiness-2026-10-12` branch, with normal hooks intact.
Local Gitleaks is unavailable; the established hook may skip that scan. This is
not secret-scan/remote-CI proof, and no scanner baseline or suppression is added.

### Sectional cadastral follow-up

The existing Sectional Properties page started with fictional records and added
20 m² of common area to every floor. It now starts empty, requires explicit
measured floor totals, checks unit/floor/type identity and positive finite areas,
rejects duplicated units and impossible floor totals, and preserves a legitimate
zero non-unit residual. Input changes invalidate results and CSV availability.
Stable record IDs replace floor-local `unit-0` identity collisions. The shared
engine performs all area/share calculations; the page does not invent geometry.

The complete draft CSV retains floor/unit identities, supplied type, measured
unit/floor areas, source reference, measurement basis and area-based shares.
The output is labelled an area schedule. Residual floor area is not automatically
asserted to be legal common property, and area shares are not approved ownership
quotas. Actual floor/unit boundary geometry, project persistence, statutory plan
forms, independent measurements and jurisdiction-specific approval remain open.
That checkpoint flagged the encumbrance module's gross corridor estimates,
overlaps/parcel clipping and registry-status wording. The follow-up below repairs
those source findings. Actual source/registry verification remains separate.

Both page regressions and three engine validation groups failed before repair.
The follow-up passes **6 tests in two additional suites**; strict app/test types
and changed source lint also pass. The earlier 411-test road/terrain run is
unchanged. The first GitHub push passed the normal hook's strict type check,
changed-file lint and **176 related tests across 22 suites**. It skipped local
Gitleaks because the tool is unavailable. No scan baseline/suppression or hook
bypass was used. All source commits remain unpromoted.

Git verification: road/terrain checkpoint `04b270a8` and sectional source
checkpoint `9e653571` were both pushed successfully. After the second push,
the working tree was clean and local HEAD matched the remote-tracking branch
at `9e6535719d9f2f902d59fb0cee5afa3a1ab5d87e`. The sectional pre-push hook also
passed strict app typing, changed-file lint and its six related tests.
GitHub's separate Gitleaks workflow reported **success** for both source
checkpoints: [road/terrain scan](https://github.com/error302/metardu/actions/runs/38479899616)
and [sectional scan](https://github.com/error302/metardu/actions/runs/38480739662).
This is remote secret-scan evidence for those exact commits, not a complete CI,
deployment, database, downstream-file or field-acceptance result.

### Encumbrance geometry and incremental station follow-up

The existing encumbrance route now starts empty and reviews supplied records,
not registration. It no longer invents a Kenya Power record, a 10,000 m² parcel,
or today's registration date. Optional source dates/references remain unknown
when omitted. Missing observations are not converted to zero, and malformed
rows, duplicate IDs, invalid widths, partial geometry and unsupported CRS fail
closed. The source catalogue describes the actual record/geometry review and
sectional area schedule rather than claiming registration/statutory compliance.

The engine accepts a measured parcel outer ring and optional holes in a declared
projected metre CRS. Authoritative source polygons are supported. For centreline
records, the operator explicitly selects a constant full-width corridor model
with butt ends and bevel joins; it is not asserted to be a legal wayleave rule.
The existing polygon Boolean library unions segment/record footprints and clips
them to the parcel, preserving concave/disjoint regions and subtracting holes.
Canonical planar shoelace area is evaluated after translating to a local origin
for numerical stability; exported coordinates are restored without rounding.
No geodesic Turf buffer/area calculation is applied to projected coordinates.

Analytical regressions reproduced the old 4,000 m² result where parcel clipping
and overlap union require 1,000 m², and the old 4,000 m² crossing-corridor result
where the correct union is 1,900 m². Tests cover an explicit 78 m² bevel-corner
model, parcel holes, a concave parcel split into separate coverage regions,
measured outside footprints with legitimate zero coverage, and unlocated records.
Unmapped records stay in the denominator/table; a partial assessment exposes its
assessed union but leaves complete coverage and percentage null. An empty list
never establishes an unrestricted title. Registry status remains `not-verified`.

The page draws a grid-north-up, equal-axis preview of supplied parcel/clipped coverage.
Every input change clears the computed snapshot and export actions, and late
module loads cannot publish outdated input results. Lightweight record parsing
and missing-information review have no runtime geospatial dependency; geometry
and DXF generation load on use. The sectional page imports its separate lightweight
area engine. No package was installed. Input/record/vertex limits bound the work.

CSV schedules retain every record, source references/dates, raw/inside areas,
assessment issues, declared CRS/model/method and explicit DXF layer mappings.
Geometry CSVs retain all source parcel/record observations plus derived clipped
rings, polygon/ring/vertex indices, holes and CRS. Draft DXF contains metre units,
original projected coordinates, source and clipped layers, holes, union geometry
and an unverified-registry/draft reference. It explicitly labels the geometry as
2D, with no surveyed elevation or vertical datum. Fresh engine recomputation rejects
stale exports. Independent writer/importer checks through METARDU's existing DXF
parser preserve closed polylines, metre units and exact synthetic coordinate
origin/extents. This is native-format parser proof, not a downstream CAD-app,
browser-download, physical print or field-verification result.

Station entry now saves a single observed station before a second section is
collected. An explicitly emptied station list can also be saved after the operator
removes its last record. Zero ground/chainage values stay valid and unknown design
levels stay unknown; volume computation still requires two complete sections.

Final source checks pass **141 tests across 12 suites**, both strict app/test
TypeScript projects, changed/new source lint and whitespace checks. The required
read-only Docker verifier passed against one healthy existing production app and
required services, with backup completion at `2026-10-13T21:33:38Z`. No service was
built, started, stopped, migrated or promoted. Owned source-preview processes
15948/17860 and loopback port 3021 were confirmed and reused. Fresh CUA navigation
to `/tools/encumbrance` again returned `net::ERR_BLOCKED_BY_CLIENT`; visual browser
QA remains open and the CAD training origin/storage was untouched.

These changes remain source-only. Project-scoped persistent encumbrance records,
source-boundary/control provenance, approved legal width/geometry, current official
records, independent observations and issued-plan acceptance remain open. The
broader cadastral boundary-to-document, road spiral/vertical/corridor set-out,
construction control/as-built, contour print/field, notice/OAuth/ChatGPT, payment
and recovery gates are not closed by this milestone. Keep the full objective active.

The first push attempt was correctly blocked by the normal pre-push hook: its
parallel Jest run reached the UI test's one-second default wait while the first
geometry import was still pending. The UI showed `Preparing…`, not an incorrect
quantity. The calculation assertions now wait up to five seconds for the actual
result and still require the exact expected areas; no mathematical assertion or
hook is bypassed. The sequential 141-test run had already passed. Parallel hook
verification must pass before the source push is considered complete.
The same parallel related-test command then passed **32 tests across six suites**.
The normal push retry also passed strict app typing, changed-file lint and those
32 related tests, with no hook bypass. Source/evidence commits through
`0f1831a613404e54546ccdfc88f76fee372a1bf0` were pushed successfully; the working
tree was clean and local HEAD matched the remote-tracking branch. GitHub's
separate [Gitleaks run](https://github.com/error302/metardu/actions/runs/38487738533)
reported success for that exact commit. Local Gitleaks remains unavailable; no
scanner baseline/suppression was added. This is source-push/secret-scan evidence,
not promotion or full platform/field acceptance.

### Evaluated road profiles and centreline targets follow-up

The existing project vertical inputs now retain blank values until explicitly
entered, accept incremental/emptied drafts, and preserve supplied curve length,
K and optional design station interval in authoritative project JSON. Tangent
grades derive from the supplied design points. The established engineering
engine evaluates symmetric parabolic curves with unrounded intermediate values.
Nonzero grade changes require a supplied length or K; conflicting parameters,
overlaps, endpoint curve parameters and coverage beyond the supplied design
are rejected. No curve is automatically selected or shortened. The low-level
standalone vertical station schedule also retains precision and includes the
exact PVT, correcting its incoming-tangent offset at that endpoint.

Station entry explicitly selects manual target RL or the saved vertical design.
Legacy manual targets, including zero, remain manual. Linked targets are freshly
evaluated for cross sections, earthworks, long-section tables and station-level
exports; stale stored RL cannot override the selected design. Measured offset
observations and the selected source survive profile CSV re-import and project
reload. Derived design samples never become ground observations.

Long sections display the evaluated parabola, supplied ground and separate
manual target points. The preview identifies independent axis scaling and the
declared/unknown height reference; it no longer invents a printed scale, road
class, speed, K or Arc 1960 datum. Parameter tables and station pages accompany
the preview. Fresh CSV/PDF schedules include curve parameters, critical/optional
regular profile stations and draft centreline E/N/surface/formation targets.
Straight and simple circular coordinates follow the supplied route geometry
and corrected chainage, including left/right curves and grid tangent bearings.
3D coordinate targets require declared projected metre CRS and height reference;
missing levels and targets outside horizontal coverage block the whole schedule.

Analytical fixtures verify a crest whose tangent intersection RL is 2 m but
whose actual mid-curve surface is 1.5 m, exact PVC/PVT levels, shallow-grade
precision, left/right quarter-circle coordinates/bearings, manual zero targets,
linked stale-RL rejection, invalid intervals and source-preserving reload/import.
Focused source checks pass **106 tests across 14 suites**, including shared
cross-section, CSV/PDF and persistence regressions. Both strict app/test
TypeScript projects, changed/new source lint and whitespace checks pass.
Browser navigation to the
owned existing `127.0.0.1:3021` preview remains blocked by
`net::ERR_BLOCKED_BY_CLIENT`; visual/browser downloads remain unverified.
The read-only Docker verifier confirms one healthy existing production app and
required services, with backup completion at `2026-10-13T21:33:38Z`. No package,
container, image, builder, migration or service lifecycle change was made.

This source milestone is centreline design evaluation, not full corridor staking
or construction acceptance. Spiral/compound/reverse alignment integration,
offsets and superelevation, issued design/control provenance, instrument/field
checks, downstream CAD/print acceptance and the standalone automatic vertical
designer's design-selection policies remain open. Existing migration/recovery,
OAuth/notice/public-directory, paid-delivery and cadastral/legal gates remain
open; this source has not been promoted to the production container.

Source checkpoint `6e98b8d31a10aaa38938c754d5db432bfc6ce718` was pushed to
`codex/metardu-workflow-readiness-2026-10-12`. Normal pre-push checks passed
strict app typing, changed-file lint and **215 related tests across 23 suites**.
Local Gitleaks was unavailable and was explicitly skipped by the existing hook;
no hook bypass or scanner suppression was used. The working tree was clean and
local HEAD matched the remote-tracking branch after the push. GitHub's separate
secret scan was still in progress at the first post-push observation; do not
equate the source push with deployment, full CI or field acceptance.

### Construction pile/grid follow-up — 14 October 2026

The existing pile/column tool now begins with blank survey coordinates, design
RL, dimensions, rotation and instrument height. Unknown values are not replaced
by zero or a sample Arc 1960 location. Explicit zero/negative measurements remain
valid where geometrically meaningful. Synthetic training values require the
named demo action. Source edits clear computed coordinates and export actions;
instrument edits clear the instrument schedule. Project/reference changes and
late responses cannot publish another project's calculated or saved state.

The grid engine preserves the clockwise rotation convention and full precision.
It rejects non-finite/overflowed extents, repeated coordinates caused by lost
floating-point precision, invalid starting labels and invalid dimensions. Same
label formats require separators (`1-1`, `A-A`) so targets cannot share IDs;
supplied numeric padding such as `A007` is retained. Existing ambiguous saved
labels are not silently repaired or relabelled: they require source-design review
and an explicit new save/revision. Historical design points/observations remain
in the existing database revision history.

The instrument schedule separates signed ground-minus-instrument-axis offset,
signed level staff reading, supplied prism height, prism vertical difference,
VA above the horizontal and slope distance. Backsight coordinates explicitly
enable clockwise angles from BS=0 degrees. Missing orientation/heights remain
unknown; partial height/backsight inputs and invalid heights block the schedule.
A co-located target has zero horizontal distance and an undefined bearing,
rather than an invented north bearing. DMS seconds carry into minutes/degrees
and wrap at north. Staff readings assume a horizontal level sight and can be
negative for targets above that horizon; they are not a requested prism height.

CSV exports retain exact numeric coordinates/levels and declared reference,
source/height conventions, setup, design identity/revision and draft status.
The DXF declares metre units and separates points, grid, outlines, annotations
and draft reference. With a supplied height reference it preserves exact design
XYZ; without one it emits a 2D plan with no point/line Z measurement. Native
parser and design-extractor fixtures verify this prevents an unknown RL becoming
zero in another METARDU tool. Stale result exports are rejected. Display tables
are paginated, the equal-axis grid-north-up preview bounds visible points, and
exports retain the complete schedule. Downstream CAD/device/print acceptance
is still separate from these internal format checks.

The authenticated project read now exposes all original saved grid parameters,
optional zero RL, label conventions and current revision for explicit reload.
The pile save previously ignored the UI's tolerance profile. It now validates
the full transcription, stores its profile and source/rules snapshot in the same
transaction as the revisioned design, and rejects a partial profile before any
write. Each revisioned point retains its source definition, height reference and
criteria snapshot, so a later definition update does not overwrite that original
design evidence. The panel reloads supplied criteria and links a confirmed saved design to
the existing field capture workflow. Project CRS and height reference govern;
the local input label cannot override the project's reference. A failed write
does not claim the local draft was saved or expose it as a confirmed field plan.

Source checks pass 101 focused tests across eight suites, including field queue,
capture UI, existing drainage API and native instrument workflow regressions,
with both strict app/test TypeScript projects. Changed/new source lint and
whitespace checks pass. The required read-only Docker verifier passed against
one healthy existing production app and required services; latest backup
completion remains `2026-10-13T21:33:38Z` (archive/header, not restore proof).
Existing preview wrapper 15948, Next process 17860 and server 5544 were reused;
fresh CUA navigation to `/tools/pile-grid` returned `net::ERR_BLOCKED_BY_CLIENT`.
Browser/download/visual proof remains open. No dependency, container, image,
builder, migration or service lifecycle change was made.

This remains unpromoted source work. Current field assessment's legacy default
tolerance fallback, approved design/control/benchmark provenance, independently
observed checks and versioned as-built acceptance require the next pass. No
automatic relabelling of prior registered targets, migration hash changes,
statutory/construction certification or full platform-readiness claim is made.

Source checkpoint `10ca818fd45eb3b203768d801edf7416a06e009f` was pushed to the
existing `codex/metardu-workflow-readiness-2026-10-12` branch. Normal pre-push
checks passed strict app typing, changed-file lint and 75 related tests across
eight suites, in addition to the focused source checks above. No hook bypass was
used. Local Gitleaks was unavailable; GitHub's separate scan was in progress at
the first post-push observation. The working tree was clean and local HEAD
matched the remote-tracking branch. Promotion/field acceptance remains open.

### Field capture and draft outputs follow-up — 14 October 2026

New project set-out captures use schema/algorithm version 2. The shared server
and field-preview authority records raw deltas without inferred criteria. A
numerical PASS/WARN/FAIL requires the point's recorded project profile, exact
design binding, declared matching CRS, capture time and positive horizontal
uncertainty within the supplied limit. Level targets additionally require an
observed level, matching declared height reference and separately supplied
vertical uncertainty. Horizontal accuracy cannot stand in for level accuracy.
These are entered numerical comparisons, not independently verified instrument
accuracy, design approval, control verification or construction acceptance.

Missing evidence remains INFO. The field screen offers an explicit unassessed
save, retaining raw values and missing facts in the device queue. Retries retain
the criteria/reference/uncertainty binding and reject changed replay evidence.
Point revision metadata governs; later project/definition edits cannot silently
replace its original criteria or known reference. Legacy targets without a
recorded original height reference remain unknown. Historic version 1 snapshots
retain their original algorithm/results, including their original default
criteria; they are not rewritten into current acceptance. Other standalone
legacy verticality/as-built paths still require their separate audit.

CSV, HTML and native PDF preserve current raw captures with unknown thresholds
and explicit eligibility issues. The unassessed PDF uses a vector table and
full-value coordinate detail, rather than invented criteria or rounded source
coordinates. Historical results are identified as historical. Both strict
TypeScript projects, changed source lint and 118 focused tests across 11 suites
passed; the final PDF layout also passed its two native export tests. Actual PDF
generation, independent text extraction and rendered inspection confirmed a
one-page synthetic draft with coordinate `500000.0001234567` and NOT ASSESSED.
The artifacts in `.cache/release-verify/` are synthetic verification output,
not customer documents, downstream device acceptance or field proof.

Forward migration 106 extends the existing snapshot constraint to both versions
and retains target precision for future saved designs using double precision.
It does not regenerate old points or rewrite applied migration 096, whose
unchanged SHA-256 is
`FF47A546A2253F04235BAD43FB0E46268D10DF7FE339D75FEAA945D2F815E2D8`.
Migration 106 has NOT been executed against PostgreSQL. Real SQL compatibility,
constraint/legacy-row validation, alteration lock duration, backup restore and
forward-compatible rollback evidence are required before promotion. The API
retains queued work and returns a specific retryable 503 if the older v1-only
constraint rejects v2. A rejected customer database clone is not bypassed.

The required read-only Docker verifier passed with one existing healthy app and
required services; backup completion was `2026-10-13T21:33:38Z`, archive/header
evidence only. No image, container, builder, migration or production lifecycle
change occurred. The previous host preview processes were confirmed absent;
the existing synthetic wrapper was restarted on the same loopback port/cache.
Next reported ready and compiled middleware/login. CUA's first navigation timed
out during compilation; subsequent inspection was rejected because automatic
approval review could not complete for the redirected `localhost:3021` origin.
No review bypass, browser storage injection or CAD drawing modification occurred.
Fresh field/browser/print/receiver checks and all wider release gates stay open.

Adjacent source audit at checkpoint `74d353de`: `evaluateVerticality` substituted an infinite
tilt ratio when height is absent, permitting PASS from the absolute offset cap
alone. Its default name also asserts a Cap. 299 standard without recorded
project criteria. The project plumb-record API uses that default and derives
height only from optional RLs. These were confirmed implementation defects,
not field-verified construction acceptance; the follow-up below repairs the
calculation/evidence path while preserving old records.

Source checkpoint `74d353dee1e69d63253a56822e1a90fbeb9772d1` (implementation
`9c4acba9fb7dcff3178da04cdefaa1c5e6edadfa` plus contract-test follow-ups) was
pushed to the existing workflow branch. Normal pre-push strict app typing,
changed-file lint and 145 related tests across 15 suites passed. The first push
was blocked by three stale contract assertions, then a second by an inherited
non-null assertion; both were repaired without bypassing hooks. Local Gitleaks
was unavailable. GitHub Gitleaks run `38542868080` completed successfully for
this exact source revision. Read-only remote inspection matched local HEAD and
the working tree was clean. This is source/secret-scan proof, not full main/PR
CI, PostgreSQL migration execution, production promotion or physical field proof.

### Column-plumb calculation and evidence follow-up — 14 October 2026

The source engine no longer adopts default plumb limits. It requires explicit
limits, specification reference/version, measured positive height and separately
reported displacement/height-difference uncertainty for a numerical comparison.
Missing height gives a NULL ratio and INFO, not an infinite ratio and PASS.
Zero measured displacement with known height alone has an infinite ratio and no
defined bearing. Non-finite coordinates, non-positive height, invalid criteria,
negative uncertainties and overflow fail closed. Both the absolute cap and ratio
must hold; FAIL identifies the actual exceeded condition, with no arbitrary
warning band or automated grouting/remediation instruction. The retained exported
default constant is labelled a historical example, not a Cap. 299 requirement.
Entered uncertainties are prerequisites, not a statistical confidence model,
independently verified instrument calibration or construction acceptance.

The project API stores a versioned original capture containing exact base/top
coordinates and RLs, declared/captured references, device time, separately
reported uncertainties, criterion transcription and source/reviewer identity,
instrument and notes. Height derives from top minus base; reversed or equal
levels are rejected instead of taking an absolute value. Missing criteria,
height/time/reference evidence is retained as INFO. Infinite versus unknown
ratios have distinct JSON-safe representations. Snapshot parsing re-evaluates
the declared algorithm and rejects tampered fields, while allowing JSONB object
key reordering. These plumb snapshots are a new algorithm; existing set-out
capture versions and old plumb rows are not rerated or rewritten.

New plumb writes require a client UUID retained before delivery. Matching retries
return the original record without another write; altered evidence conflicts.
The unique project/delivery key and insert-conflict path handle concurrent retry
delivery. Unknown API actions cannot fall through into a plumb write. Project
reads preserve the recorded historical result, with a separate current numerical
result/scope that stays INFO for historical or invalid snapshot evidence.
The API returns a specific retryable 503 when the new capture columns are absent.

Forward migration 107 adds nullable capture/delivery fields, a unique delivery
index and structural/rounded-register coherence checks to the existing
append-only plumb table. It is NOT executed on PostgreSQL. Old migration 075 and
its immutability triggers remain unchanged; no customer records were backfilled.
SQL execution/legacy-row validation, index/lock behavior, recovery and rollback
compatibility require verification before promotion alongside migrations 105/106.

Source verification: 127 focused tests across 13 suites, both strict TypeScript
projects, changed/new source lint and whitespace checks passed. Cases cover
analytical plumb limits, unknown/invalid inputs, JSON round trips/tampering,
API ownership, unknown-criteria persistence, replay/conflict and schema-not-ready
behavior, plus existing set-out capture, construction/drainage and native export
regressions. The per-column field form is still absent; connect this repaired API
to the field collector with persistent account-scoped drafts/offline delivery and
native plumb report/CSV outputs next. API tests mock PostgreSQL and do not prove
SQL constraints, receiver operation, browser rendering or physical field
acceptance. The broader construction/as-built and five-family scope stays active.

Fresh `npm run docker:verify` failed both normally and with Docker access review;
direct read-only inspection confirmed the Docker Desktop Linux-engine named pipe
was absent. Current container health/inventory is therefore unverified, rather
than inferred from the prior checkpoint. No service start, image build, container,
builder, migration, cleanup or production lifecycle action was performed.

Source checkpoint `e4b8f2b0dcf004be21cd071cf2ffd5d2f40ee2ed` was pushed to
the existing workflow branch. Normal pre-push strict app typing, changed-file
lint and 174 related tests across 17 suites passed, including the final matching
concurrent-delivery test. Strict test typing passed separately after that test
was added. Local Gitleaks was unavailable; GitHub Gitleaks run `38547577504`
completed successfully for this exact source revision. Local HEAD matched the
read-only remote query and the working tree was clean. The initial Git write
attempt did not execute because approval review disconnected; the same reviewed
action succeeded on retry. No hook, scanner or permission-review bypass was used.
This checkpoint does not prove full main/PR CI, migration execution, live or field
acceptance; the remaining workflow and release gates above are still required.

### Column-plumb field collector follow-up — 14 October 2026

The existing `/field/setout` route now has a `mode=plumb` collector, reached from
the selected project's field workflows. The normal point collector is preserved.
This form starts with blank observations, criteria and uncertainty, requires the
declared project reference, and delegates its numerical preview to the existing
versioned engineering authority. Invalid/partly entered values cannot become
zero. Missing evidence can be explicitly recorded as unassessed. Entered grid
coordinates and applicable limits govern; the preview does not apply a
grid-to-ground correction, statistical confidence model or construction approval.
Display rounding does not change the captured/exported values.

Each validated observation receives a stable UUID and its own device-storage key
before delivery. Device records and unfinished form drafts are scoped to the
signed-in account and project. Account/project changes remount the collector;
late reference responses cannot populate another job. The backend also rejects a
queued reading's `capturedBy` if it differs from the authenticated account. A
double tap is locked so it cannot create two separate captures. Reading-specific
coordinates, time, uncertainties and reference confirmation reset for the next
reading, while the entered project specification and instrument setup remain.

Network failures, expired authentication, throttling and schema-not-ready
responses keep the original queued reading. Permanent server refusals/conflicts
remain on the device for review. A successful HTTP flag alone cannot confirm a
save: the returned server ID and parsed capture must match the original evidence.
Retries preserve the original time, values, criteria and UUID. Device quota
failure blocks delivery and leaves the measured values in the form. Unreadable
records/drafts are not silently overwritten or discarded. Explicit device
backups include scoped raw entries and the visible form even when storage cannot
be read. No existing CAD/field-book database or customer record is rewritten.

An unavailable connection can use the previously loaded project reference only
after explicit cached-reference review. Its age/basis appears in the form and
capture notes. A definitive 401/403/404 reference refusal cannot fall back to a
cache to enable new capture. Server ownership and current reference checks still
govern delivery. This proves source-level persistence/delivery behavior in an
authenticated field view; cold offline authentication, browser storage recovery,
real device operation and actual network/session transitions still require
verification. Local drafts are not server-register or certified field evidence.

Device CSV exports retain exact numeric E/N/RL, signed levels, full observation
and criteria/reference/uncertainty/time metadata, source identity and explicit
device-only versus server-confirmed draft status. Textual spreadsheet formulas
are neutralized without converting negative numeric levels into text. UTF-8 BOM
and an independent native Papa Parse round trip verify column names, negative
levels, raw precision and missing-value blanks. JSON backs up complete scoped
device entries and unfinished forms. Native PDF/HTML and full saved plumb-history
reports remain the next output pass; these device exports do not substitute for
an independently reviewed construction handover.

Final focused source checks: 99 tests across 10 suites and both strict TypeScript
projects pass, with changed-source lint/whitespace checks. The tests exercise
the real React form and browser Storage API under jsdom, with external auth,
network and PostgreSQL mocked. They do not prove live browser rendering, actual
download completion, applied SQL constraints, hardware or field acceptance.
Global app navigation, the canonical theme tokens and its primary content
landmark are retained; no new dependency, container, image or builder is added.
Fresh normal/reviewed `docker:verify` still failed to access Docker. No service
lifecycle action, database migration, promotion or cleanup was performed.
Migration 107 and the existing migration/recovery/rollback gates remain open.

Source checkpoint `e5546a45d815cbc33ccb2c81ccc3528d41f2c4d7` was pushed to
the existing workflow branch. Normal pre-push app typing, changed-file lint and
65 related tests across eight suites passed, in addition to the explicit-path
99-test/ten-suite run and strict app/test checks above. GitHub Gitleaks run
`38563335216` completed successfully for that exact source revision; local
Gitleaks was unavailable and no hook bypass was used. The working tree was clean
at the post-push check. Follow-up presentation uses the existing foreground/
background theme roles for capture-button contrast in dark/light/outdoor modes,
with the company accent retained on its border. That source correction is not a
substitute for fresh rendered viewport/physical-device review.

### Saved column-plumb history outputs — 14 October 2026

The existing private set-out export endpoint now accepts `kind=plumb` and CSV,
standalone printable HTML or native PDF. The field collector exposes these saved
report links separately from device-only CSV/JSON backups. Optional exact column
label and server-recording UTC bounds narrow larger histories; device time is
not substituted for the server-recording filter. Bounds normalize timezones and
reject reversed/invalid ranges. All saved re-observations remain visible, ordered
by column/level/time/ID, rather than only the latest result.

Project access is checked before the observations query. The returned project
identity is also verified against the authorized project. SQL uses bound filter
parameters, explicit project ownership scope and a limit sentinel. More than
1,000 CSV/HTML readings or 250 PDF readings requires narrower filters, with an
explicit 413; no partial report is silently issued. Empty histories return 404.
Responses are private/no-store attachments, and self-contained HTML has a strict
no-script/no-external-resource content policy.

The report evidence model validates snapshot algorithm, identity, result,
instrument/notes and rounded-register coherence before using captured values.
Inconsistent/unsupported captures block export instead of becoming plausible
legacy data. New captures retain exact original E/N/RL, declared/observed CRS and
height reference, separate uncertainties, criterion source/revision/transcribed
approver, instrument/account identity, device/server times and algorithm version.
Historical PASS/WARN/FAIL/INFO results remain recorded, separately from current
NOT ASSESSED. Missing capture references, units, height or criteria are not
reconstructed from current project settings or old rounded values. Legacy table
headers show stored values without an invented metre label; CSV explicitly flags
capture coordinate units while retaining the coordinate-column convention.
These are draft numerical histories, not construction acceptance or a statutory
plan/certificate. Device-only observations are excluded from server reports.

Native PDFs reuse the canonical company icon, verified bundled font and existing
vector PDF engine. Tables retain full coordinate precision; source/uncertainty/
identity notes wrap and continue on numbered pages. Unsupported font characters
produce a specific 422 with HTML/CSV alternatives rather than silently losing
saved text; a mismatched font is rejected. CSV neutralizes spreadsheet formulas
while retaining numerical values, and HTML escapes all saved labels/notes.
No browser renderer, external font, added package or Docker image is required.

Verification passed 55 focused tests across eight suites, both strict TypeScript
projects, changed-source lint and whitespace checks. Actual native generation,
independent PDF text extraction and PNG inspection verified a two-page synthetic
current/historical example, exact coordinate `500000.0001234567`, clear historical
NOT ASSESSED and no assigned legacy coordinate units. Long-note pagination,
glyph/font failure, scope/refusal, filters, limits, mismatch and the existing
set-out/field regressions pass. The ignored `.cache/release-verify/` artifacts
are synthetic QA output, not customer documents or field evidence.

Fresh normal/reviewed Docker verification remained unavailable; no service
lifecycle, migration, image, builder, container or cleanup action occurred.
The history loader reads older rows without requiring new capture columns, but
new capture writes still require unapplied migration 107. Real PostgreSQL query/
constraint testing, recovery/rollback compatibility, production promotion,
browser/download/printed-page checks, offline session/device tests and independent
field/control acceptance remain open across the five-family workflow matrix.

Source checkpoint `6189dbfb1e991a6a26c1a5d8762f86dc438dcd8f` was pushed to
the existing workflow branch. Normal pre-push app typing, changed-file lint and
45 related tests across five suites passed, in addition to the explicit-path
55-test/eight-suite run and strict app/test typing above. GitHub Gitleaks run
`38571087721` completed successfully for this exact source revision. Local
Gitleaks was unavailable; no hook/scanner bypass was used. Read-only remote
inspection matched local HEAD and the working tree was clean. Full main/PR CI,
PostgreSQL/runtime, browser/print and physical-field gates remain distinct.

Adjacent shared-collector audit identifies the next source pass: `/field` retains
projects/points/measurement drafts when its auth callback changes accounts, and
its request callbacks have no owner/project generation guard. Its batch parser
uses `parseFloat`, fixed easting/northing limits and generated labels instead of
the declared project reference and atomic strict input contract. These defects
are confirmed in source, not a demonstrated live cross-account disclosure. Repair
the existing collector and test account changes, delayed responses and imports
before claiming the broader offline/field workflow is complete.

## Shared field collector repair — 14 October 2026

The existing `/field` page now uses the application's NextAuth session instead
of the legacy polling auth adapter. Each account has a separate mounted workspace;
late reads/saves from a previous account cannot update the new account form.
Project point requests and instrument callbacks carry generation guards. Switching
projects retains each job's point, batch, traverse, level and radiation drafts in
account-local memory, and restores that job's original values. Project switching
and point-form editing are blocked while a point save is outstanding.

Single and batch point saves inspect returned database errors before clearing
input or showing success. A synchronous save guard prevents duplicate taps; this
is not yet an idempotent retry contract after an ambiguous network response.
Messages and point-save status are visible, and no permanent fake offline/synced
indicator implies that all measurement drafts have been persisted.

The shared raw-point parser uses the existing Papa Parse dependency for quoted
CSV. Complete finite decimal values, explicit names and optional finite heights
are required. Missing heights remain null, zero/negative local-grid coordinates
are retained, and no arbitrary UTM range or generated name is used. A malformed
row rejects the whole preview; changing CSV invalidates the old preview. Duplicate
names within a batch, extra columns and batches over 1000 rows are rejected without
silent truncation. No CRS transformation, datum, units or instrument accuracy is
inferred by this quick entry path. The UI requires the surveyor to confirm the
applicable project reference before using these raw coordinates.

Instrument import retains the observed name, E/N and optional height; a reading
with only latitude/longitude cannot be stored as projected E/N. Original reading
metadata is retained in the existing `survey_points.description` text column,
not an invented `notes` column. Stored null/blank coordinates remain unknown in
recent-point display. These source/DOM checks do not prove receiver operation or
database storage on the deployed schema.

The quick traverse page no longer fabricates face-right readings, 90-degree
vertical angles, 1.5 m instrument/target heights and zero control coordinates from
entered bearings to obtain a tolerance grade. It retains quick entries and labels
closure as unassessed, directing measured observation/control setup to Field Book.
The established engineering engine is unchanged; this removes a false evidence
adapter rather than asserting that quick entry supplies a complete traverse.

65 focused tests across four suites pass: actual field-page DOM interactions,
strict point parsing, the plumb collector and the database query adapter. The new
regressions failed before repair. Fresh ordinary and reviewed Docker verification
both failed access; current production health remains unknown. No container,
image, builder, lifecycle, migration, cleanup or dependency installation occurred.
Both strict TypeScript projects and changed-file ESLint also pass for this batch.

Remaining field gates: durable storage and scoped recovery for this quick page;
explicit project/point CRS and height-reference binding; stable observation IDs
and idempotent retries; stricter quick traverse/level/radiation entry and actual
reductions; live PostgreSQL, browser/mobile and physical instrument checks.
The matrix's cadastral, engineering, road, construction and topographical
acceptance work remains open; this repair does not declare the platform finished.
