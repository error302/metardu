# Road workspace: retained terrain review

27 October 2026. Source, isolated database and loopback browser checkpoint.
No production promotion or field acceptance.

The connected road workspace previously had design geometry and original measured
section lines but no retained terrain input. It now selects an exact saved surface
revision, displays its original faces in 3D, and computes separate review sections
against the edited horizontal alignment. Original station observations are retained.

## Selection, source and save

The authenticated road-terrain reader requires the original account, project,
engineering hash and reference hash. It rechecks the recorded owner and locked
road source, then lists at most 200 revisions or loads one exact revision ID.
It never substitutes a surface head, current observations or a newly triangulated
mesh. Another account, changed road/reference or unavailable revision is refused.

The surface inspector is shared with retained civil-surface export. It checks
the saved snapshot/input/mesh/reference identities, parameters, counts, domain
evidence and triangle topology before returning the retained coordinates/faces.
The full normalized project reference must still match the surface reference.
Read access follows existing surface-review access; this adds no paid export or
entitlement change. The new road editing reader is owner scoped.

The road saves a bounded terrain identity and review recipe, not another copy of
the mesh. Revision, input, mesh and reference hashes and `fieldVerified: false`
travel with the binding. Device recovery retains selection and numeric text,
including incomplete input. The conditional road command reloads the exact terrain
at commit, independently evaluates the binding and archives the original request
and outcome. Generic engineering updates may preserve an existing binding, but
cannot select, replace or remove it; those changes require the validated command.

## Computed review and limits

Measured sections and retained-terrain review are explicit separate modes. The
terrain mode constructs a temporary review road. It does not overwrite, relocate,
reclassify or adopt measured stations. Horizontal/profile/template edits drive the
views from the current draft; the saved terrain revision stays fixed.

Sections intersect the retained triangle planes along the perpendicular to the
evaluated route bearing. Their breakpoints include triangle boundaries and the
centreline. A transect must have complete coverage; outside faces, interior gaps,
exclusions, ambiguous overlaps, inconsistent edge heights and invalid geometry
are refused. No nearest-face or convex-hull extrapolation fills unknown ground.
The view uses a 1e-7 m offset comparison tolerance and 1e-6 m edge-height consistency
tolerance; these are numerical checks, not instrument accuracy claims.

Review is bounded to 60,000 retained vertices / 20,000 faces, 500 sampled sections,
2,000 breakpoints per section and 250,000 profile points. The interval and
half-width are explicit inputs. Larger jobs require bounded work packages; no
data is silently truncated. List history is capped with an explicit notice.

Section cut/fill areas can be reviewed from complete terrain transects. Whole-road
terrain volumes remain **Unassessed**: a regular station schedule can miss an
exclusion between stations, and continuous coverage / volume integration has not
been accepted. Measured-input quantities remain in their original source mode.
The 3D formation links are display geometry, not an adopted corridor or issued
quantity artifact. Saved binding does not equal field/professional approval.

## Evidence

- 354 tests in 42 suites pass. Source regression, TypeScript, direct ESLint, security and runtime receipts
  are in `.cache/road-terrain/source-checks.json`. The combined manifest includes
  the road engines/recovery, retained civil handoff, owner proxy and new terrain
  engine, draft, reader, API and component suites.
- The opt-in restricted-role PostgreSQL test has 18 named checks, including exact
  owner terrain read, conditional binding, preservation of original stations,
  changed-reference refusal, immutable cancellation and archive-failure rollback.
  All temporary identities, project, surfaces, revisions and outcomes roll back;
  applied migration hashes remain unchanged.
- The HTTP verifier uses only the marked existing loopback test database and
  source preview. Its separate synthetic terrain mode has 18 checks. Ten
  browser/native checks compare the observed browser save to actual project JSON,
  its exact immutable request/outcome and selected retained mesh, confirm ordinary
  free access, test generic binding-write refusal and recheck migration hashes.
- CUA selected a synthetic retained revision, reopened the unfinished selection
  in a fresh tab, edited the road, recovered an interrupted save using the original
  request, confirmed the save and reloaded its binding. The observed computed
  section area was 21.250 m². Under the same edited design, measured-input mode
  showed 16.000 m² and 230.000 m³. Terrain volume remained Unassessed.
- Desktop 1600 x 1000 and phone-width 390 x 844 checks found no page-width overflow.
  The focused phone section was 346 x 280 with no horizontally clipped labels.
  `saved-workspace.png`, `phone-section.png` and DOM-backed JSON observations are
  in the evidence directory. Viewport overrides were reset, the browser session
  signed out, task tabs closed and the exact QA profile suspended. No browser
  storage internals were written; no Pro fixture or billing/provider change occurred.
- The browser fixture is an explicitly assembled synthetic retained mesh, not a
  terrain-worker or instrument result. An initial fixture mixed timestamp wire
  representations and was correctly refused. A corrected revision was appended;
  the rejected revision remains intact. Product integrity checks were not relaxed.
- The final small error-clearing change after browser QA has component/regression
  evidence; the browser receipt retains its own preceding source hashes. Receipt
  scopes and any source delta are recorded separately.

## Remaining gates

The current retained civil-surface admission still requires UTM zone/hemisphere
metadata. Admission of other registered projected metre grids needs separate
work; this checkpoint does not establish worldwide CRS coverage or field adoption.
Surface sampling is not original-observation ground reassociation. Continuous
terrain-volume coverage/integration, selected issued road revisions, validated
IFC/LandXML/DXF/instrument handoff, direct graphical editing, cooperative/ward-scale
load and actual independent surveyor/field/receiving-CAD/print acceptance remain.
Legacy durable request/reference binding and atomic mirror consistency remain
open, as do customer clone/restore admission, worker artifact alignment,
owner-deferred signing-key work, provider/paid lifecycle, administrator/physical
phone checks and coherent candidate/rollback promotion. Preserve Cloudflare parcel
containment and the localhost CAD training drawing. No customer migration, new
application container, production build, push or promotion was performed.
