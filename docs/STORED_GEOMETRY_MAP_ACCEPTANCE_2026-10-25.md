# Stored parcel geometry map checkpoint

Source checkpoint for the large-project direction on 25 October 2026. This is
part of the active field-to-finish goal, not a production, instrument, legal
subdivision, receiving-CAD or field acceptance claim.

## Result for a large scheme

After importing scheme metadata and reviewing a particular parcel boundary,
the individual surveyor or team coordinator can open the scheme map or load
stored geometry in the work map. The project register count is separate from
the shapes in the current view. Dense areas display count-bearing visual
groups; zooming in loads individual stored polygons. A group is not a beacon,
survey observation, parcel centroid or invented boundary.

The endpoint reads `parcels.geom`. It does not manufacture rings by alphabetic
station order or automatically put every parcel vertex into a new drawing.
Only the layer's own sources, requests and listeners are removed on cleanup.
The existing CAD training drawing and browser storage are untouched.

This supports the proposed Mwavumbo campaign structure; the synthetic 10,000
records used below do not represent the ward's actual parcel count, observed
boundaries, ownership or approvals.

## Reference and evidence

The authenticated account must own the selected project. Reads derive a
canonical registered projected EPSG reference from its saved reference record,
with a hash of that full record. There is no Arc 1960/zone fallback. Stored
geometry carrying another SRID is counted and hidden, not relabelled. The work
map must agree with this declared grid. Standalone map display consumes that
same declaration. Web Mercator is used only for display.

Individual polygons distinguish three states:

- Reviewed draft: retained boundary receipt, parcel revision/exact timestamp,
  geometry, saved reference, traverse and coordinate/observation edit tokens
  still match. Only this state supplies background snapping geometry.
- Changed since review: one of those records changed. Show the stored shape
  with a different outline and refuse snapping until another explicit review.
- Unassessed stored geometry: no accessible matching review history. It may be
  displayed in its declared grid, but never presented as reviewed or snap-ready.

All three remain independently unverified. A stored parcel status is reported
as a recorded value, not used to infer field approval. Generic vertices are not
shown as physical beacons. If migration 119's history is absent, shapes are
explicitly unassessed. Nothing in this map applies that migration.

## Bounds and failure behavior

The extent endpoint returns aggregate counts and bounds, not station arrays.
Viewport SQL uses existing canonical project/spatial indexes and selects a
bounded page before individual geometry/evidence serialization. At most 50
individual shapes or 500 visual groups are returned. Individual geometry is
checked for valid Polygon topology and at most 5,000 vertices. A viewport has a
30,000-vertex total and a conservative 2 MiB geometry budget; the client also
limits the complete response stream to 3 MiB before parsing. Omitted records
and partial views are explicit. These limits are display bounds, not a maximum
project size or a production performance SLA.

Pan/zoom clears outlines and snapping immediately, aborting the preceding
request before the short debounce. Late replies cannot restore the old view.
Project/reference changes, hidden polygon layers, load failures, explicit
removal and unmount also invalidate snapping. A changed saved reference requires
reload. A failed read remains unavailable, never a successful empty project.
The dedicated page keeps header, status, map and legend in normal layout flow,
uses geomatics/interface SVGs and links to real scheme/register/deliver stages.

`readSchemeSelection` provides a bounded exact-ID read for later export work;
it rejects missing, incompatible, invalid, oversized or partial selections.
It is not yet a replacement export endpoint or a retained artifact receipt.

## Verification and boundaries

The new contract, actual OpenLayers lifecycle, hook lifecycle and page tests
exercise identity/reference validation, malformed and oversized replies,
history/hash requirements, total vertex bounds, late replies, layer visibility,
project/grid changes, owned cleanup and explicit unavailable/retry presentation.
The final run passes 74 tests across nine suites, including the boundary review,
parcel register, scheme CRS and map wiring regressions. Reports live under
`.cache/scheme-geometry-view/` and are local evidence, not committed artifacts.

The native verifier's exact `view` mode passes all 79 cases: the existing 50
reviewed-boundary checks plus 29 actual route/SQL/PostGIS map checks. It uses the already inspected
synthetic rehearsal service and an exactly marked temporary schema, without a
public-schema search-path fallback. It fingerprints public records and the
migration ledger and removes only its owned fixture. Its bounded authentication
adapter is distinct from ordinary-account HTTP, browser and production RLS proof.
The first map run exposed an unqualified spatial operator under that restricted
search path; the query now explicitly uses `OPERATOR(public.&&)`.

The 10,000-polygon synthetic overview represents all records in 100 visual
groups with a 16,862-byte payload. That is a bounded artifact observation, not
a measured end-user latency, concurrency or physical-device benchmark.

Application/test types, scoped lint, focused Jest, native `view` and static route
validation pass (238 page files, 823 static links, zero unmatched references).
The staged security gate passes (119 migration hashes pinned; API-proxy/PWA
guards verified). No available
signed-in QA browser tab was present for the final browser check; ordinary-user,
administrator, mobile layout and actual map interaction proof remain open.

No production build, migration, promotion, service lifecycle action, entitlement,
account role or provider change is part of this checkpoint. Canonical migration
000 already contains the required spatial/project/parent indexes. Boundary
history migration 119 remains fixture-only. The existing Docker runtime check
passed earlier in this work; source promotion and previously documented worker
artifact alignment, restore and release gates remain separate.

## Next work

Legacy GeoJSON/DXF scheme routes still need owner-bound, revision-bound,
reference-correct selection, retained artifact bytes/manifest and atomic
deliverable registration. Removing their misleading map-page download anchors
does not repair those routes. Public parcel sharing/privacy and invented
reference/status defaults remain another release blocker. Legacy traverse
intake, durable uncommitted review recovery, crew permissions/conflicts,
instrument round trips and independent field checks remain in the main plan.
