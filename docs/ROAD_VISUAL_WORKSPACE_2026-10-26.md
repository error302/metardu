# Connected road review workspace

26 October 2026, Africa/Nairobi. First implementation phase of
`ROAD_WORKSPACE_BENCHMARK_2026-10-26.md`. The full road delivery target and broader
production goal remain active.

## Available behavior

Existing saved road projects open a visual review in the existing engineering
page. Explicit input-workflow and step links remain available. A new project's
first save stays in its input workflow rather than changing views mid-edit.

The work view places evaluated plan, 3D formation, longitudinal profile and
cross-section together. One selected chainage updates the coordinate/target
readout, plan/profile markers, selected section and 3D highlight. Selection can
use the plan, profile, numeric input or previous/next measured-station buttons.
Focused view controls support smaller screens. Save errors and progress in the
adjacent engineering workflow are now in flow, with persistent error messages,
instead of floating over controls. Its header wraps and uses proper status icons.

The Road Design tools page also has an explicitly **synthetic worked example**.
It uses the same components and computational authorities. It supplies no real
client, site, adopted standard, field evidence or approval. It links into the
project workspace without inventing a saved project or exposing customer data.

## Computational and display basis

`roadWorkbench.ts` shares the existing horizontal/transition, vertical,
cross-section and quantity engines. `roadFormationProfile` now supplies the
formation crown, carriageway edges and shoulders to both section calculation and
3D rendering. The road ribbon preserves camber and shoulder crossfall. It does
not connect across an unknown manual target. Independent measured section lines
are batched into two GPU geometry objects rather than thousands of draw objects.
Selection updates without rebuilding the entire renderer. Owned GPU resources,
orbit controls, observers, animation frames and contexts are released on teardown.

The plan and section axes use equal metre scales with actual viewport bounds.
Profile axes are scaled independently and labelled accordingly. Responsive SVG
viewports keep axis labels readable rather than shrinking a fixed desktop plot.
Display curve sampling is separate from exact selected-chainage evaluation and
is never the source for coordinate exports or quantities. GPU coordinates are
translated to a local origin before Float32 conversion; retained calculations
continue to use the shared engines' full numerical precision.

The workspace requires a matching projected metre CRS and an explicitly reduced
grid basis. It does not guess a ground-to-grid factor. A declared shared height
reference is required for world-space 3D and section-area assessment. Unknown
manual targets remain unknown even when a vertical alignment exists. Ground
profiles and daylight are never extrapolated for quantities. An intermediate
selected chainage may show its evaluated design template while ground and areas
stay unassessed. Cached earthworks and stale calculated targets are not reused.

Draft volumes use the existing average-end-area calculation from the supplied
sections. Material factors and curvature corrections remain unassessed. Current
view budgets are 1,000 horizontal/VIP inputs, 5,000 stations and 250,000 measured
profile points; the quantity engine's existing byte budget also applies. These
are bounded-work-package limits, not ward-scale capacity proof.

The 3D view renders formation display geometry and measured section input lines.
No ground TIN is reconstructed from those lines. Selecting an exact retained
terrain revision for the road model is still required implementation work.

## Save acknowledgement

The shared project-engineering save helper now requires one returned row with
the exact project ID and normalized engineering-data payload. Wrong-project,
missing-payload and changed-design acknowledgements are refused. The existing
query-builder UPDATE returns `*`; this change does not request another database
mutation or alter a migration. An invalid response after a possible commit is
reported as unconfirmed, with the original input kept for recovery. It does not
prove rollback or implement an immutable road-revision request journal.

## Evidence

- Regression cases first reproduced the absent connected workbench, wrong save
  acknowledgements, first-save navigation jump, missing height-reference area
  gate and missing geometry batching.
- The focused road regression includes shared alignment/transition/profile/
  section/quantity engines, hydration, saves, input/output UI and the new work
  view: **101 tests in 19 suites pass**. Its authoritative receipt is
  `.cache/road-workbench/jest.json`. Application and test TypeScript pass; ESLint
  on all 18 changed TS/TSX files passes with zero errors and warnings.
- The static security gate passes: 119 applied migration hashes remain pinned;
  API/PWA guards and 743 test files / 3,303 source files were checked. This does
  not substitute for authenticated runtime, recovery or release acceptance.
- CUA loaded the actual existing host preview at
  `http://127.0.0.1:3021/tools/road-design`, opened the synthetic example and
  observed all four views including the actual WebGL canvas. Chainage 10 showed
  unassessed ground/area; the next measured station at 20 updated the coordinates,
  target and area. The phone focused profile used a responsive 346 × 280 SVG.
- DOM-backed layout observations at desktop 1280 × 575 and phone 390 × 844 found
  no page-width overflow or clipped plot labels. The temporary viewport override
  was reset. Full-page screenshots and observations are in
  `.cache/road-workbench/desktop-workspace.png`, `phone-profile.png`,
  `browser-desktop.json` and `browser-phone.json`. This is synthetic source-preview
  evidence, separate from ordinary saved-project/admin and production proof.
  Actual orbit dragging changed the 3D view, and its Fit control restored the
  complete model. The final desktop image was captured from page top so the
  fixed site navigation is shown in its proper position.
- `npm run docker:verify` passed before runtime work: one production application,
  required services running/healthy, and the 26 October 02:00:04 UTC archive/header
  backup. It did not prove restore recovery. No production service or customer
  database was built, started, stopped or migrated.

Final source hashes, command outcomes, preservation comparisons and receipt
hashes are recorded in `.cache/road-workbench/source-checks.json`.

## Remaining road delivery work

Live PI/grade/template editing in the work view, durable account-bound draft
recovery and conflict handling, exact retained-terrain selection, immutable road
revision/archive binding, and independently checked revision-bound IFC/LandXML/
DXF and instrument delivery remain open. The existing input workflow is the edit
path in this phase. The known IFC route's first-alignment selection and
missing-height-to-zero behavior remain explicit blockers for trustworthy road
interchange; this view does not validate that exporter.

Ordinary saved-project/admin sessions and actual-phone acceptance, real instrument/controller files,
independent surveyor and receiving-CAD/print checks, multi-crew and ward-scale
load/recovery, provider/payment checks, customer-clone/restore admission, worker
artifact alignment, owner-deferred signing-key rotation and coherent production
promotion retain their existing gates. Preserve the Cloudflare parcel containment
and the localhost CAD drawing. No part of this phase marks those gates achieved.
