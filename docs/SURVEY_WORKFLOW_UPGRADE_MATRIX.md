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
| Cadastral | `/cadastral-workflow`, traverse/COGO, CAD, topology check, subdivision, mutation plan, deed plan | Source boundary records and control → observations/adjustment → boundary reconstruction and neighbour/topology checks → subdivision/areas → reviewable plans and coordinate schedules with evidence/revisions | Independent known-boundary fixtures; closure/adjustment/area and topology checks; parser round trips; traceable legal/source boundaries and jurisdiction-specific issue review. A title search or certification must not be simulated. |
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

All changes are to be committed/pushed on the existing
`codex/metardu-workflow-readiness-2026-10-12` branch, with normal hooks intact.
Local Gitleaks is unavailable; the established hook may skip that scan. This is
not secret-scan/remote-CI proof, and no scanner baseline or suppression is added.
