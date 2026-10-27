# Continuous road terrain coverage

27 October 2026. Source and component checkpoint; no production promotion.

The retained terrain workspace could verify individual sections while missing an
exclusion between them. Computed mode now checks the entire horizontal route's
review strip independently of the entered section interval. A complete result
states the chainage range and explicit positive/negative review half-width.
Original measurements and saved terrain/design identities are unchanged.

## Geometry and refusals

`retained-tin-strip-enclosures` version 1.0.0 validates finite, bounded mesh
geometry, unique XY vertices, triangle incidence and positive-area face overlap,
including disconnected nested faces. It uses robust orientation predicates and
spatial bounding trees. It does not recreate a mesh or fill an exclusion.

For a non-overlapping retained triangle complex, a connected enclosure with an
inside point and no mesh boundary intersection is contained in that complex.
Every route segment is covered by such enclosures. Tangents use their full
rectangle; circular and clothoid segments use conservative rectangles about each
interval's midpoint tangent, subdividing where the larger enclosure meets a
boundary. This follows the existing alignment evaluator, including both turns.

For arc length h and curvature magnitude bounded by K, centreline displacement
from the midpoint tangent is bounded by K h²/8; the change in the offset normal
is bounded by K h/2. Each rectangle expands both axes by K h²/8 + w K h/2 for
half-width w. K is zero on tangents and at most 1/R on circular/transition
segments. An additional outward numerical guard is max(1e-7 m, 128 Float64
epsilons times the coordinate/length/radius scale). It is not an accuracy claim.

Boundary contact is never discarded by an area tolerance. A gap, exclusion,
overlap, invalid reference/geometry, boundary contact, unresolved enclosure or
exceeded work budget returns **Unassessed**. A result can conservatively remain
unassessed even where a road strip touches a valid terrain edge. It does not
claim an actual gap merely because an enclosing rectangle cannot be admitted.

Limits remain 60,000 vertices / 20,000 faces and a half-width in (0, 500] metres.
The checker additionally bounds tree/comparison work at 2,000,000 operations,
20,000 enclosures and subdivision depth 20. It yields during checking and honors
cancellation. Design/reference/mesh changes revoke the old displayed verdict;
leaving computed mode or unmounting cancels unfinished work. No browser storage
or saved project state is written by this diagnostic.

## Evidence

- The initial component regression failed because no continuous coverage result
  existed. The completed regression has 386 tests in 44 suites, covering road
  geometry, source preservation, recovery, retained terrain and delivery readers.
- New engine cases cover internal shared edges, cardinal/oblique translated
  strips, circular and transition routes, conservative subdivision, an off-centre
  hole between otherwise successful transects, a 1e-8 m synthetic exclusion,
  overlapping disconnected faces, invalid sources, boundary contact and aborts.
- A complete synthetic 20,000-face work package passes within the geometry
  budget. This is a bounded source-engine test, not a ward-scale field,
  collaboration, browser responsiveness or physical phone benchmark.
- Component tests exercise the real checker through terrain selection and
  separately verify that cancelled/late old-design results cannot reappear,
  terrain removal clears a displayed verdict, and mode/unmount cancels work.
- Full application/test TypeScript, five-file ESLint and the security gate are
  recorded in `.cache/road-corridor-coverage/source-checks.json`. Existing Docker
  runtime health remains a separate check; backup archive/header evidence does
  not prove restoration.

This checkpoint adds no server write, migration, entitlement, provider action or
new fixture. The previous ordinary/free browser QA account remains suspended;
its signed-out session, retained revisions and evidence are preserved. This
new coverage status has component proof, not a fresh authenticated browser,
production or independent numerical/field acceptance claim.

## Remaining work

Whole-road terrain volumes deliberately remain **Unassessed**. Strip coverage
alone does not establish daylight everywhere, curvature/Jacobian treatment,
integration convergence/error bounds, material factors or an issued quantity
artifact. That integration and independently reviewed reference cases remain
required. The work also does not adopt or reassociate original observations.

Selected issued road revisions, validated IFC/LandXML/DXF/instrument delivery,
non-UTM retained-surface admission, direct graphical editing, ward-scale
collaboration, legacy request/reference and mirror consistency, customer
clone/restore admission, worker artifact alignment, owner-deferred signing keys,
provider/paid/admin/physical-phone checks, independent surveyor/field/CAD/print
acceptance and coherent candidate/rollback promotion remain open. Preserve
Cloudflare containment and the localhost CAD training drawing.
