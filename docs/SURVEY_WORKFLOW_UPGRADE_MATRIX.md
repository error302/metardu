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
| Road | Road field plan/collector, horizontal/vertical alignment, station entry, cross sections, earthworks/mass haul, drainage, long section, export | Ordered alignment and chainage → surveyed centreline and offset profiles → approved pavement/formation/slopes → sections/daylights/quantities → set-out/level/profile schedules → as-built comparison | Current batch improves circular geometry and measured sections, including standalone calculator consolidation. Transition/compound/reverse alignments, vertical design evaluation, full corridor coordinate set-out, measured-middle-section prismoidal scheduling, curvature/material evidence and field checks remain open. |
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

1. Connect the established spiral/vertical engines, approved alignment revisions
   and coordinate set-out to road project schedules. Replace stale saved derived
   values with explicit current-revision computations and acceptance evidence.
2. Run cadastral boundary-to-document fixtures through actual import, adjustment,
   CAD/topology, subdivision and native output parsers; repair the discovered
   failures, retaining original observations and legal/source evidence.
3. Verify construction control, design import, stakeout/level checks and as-built
   outputs together. Connect field observations to targets and tolerances rather
   than treating a manually entered coordinate as verified construction.
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
