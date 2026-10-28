# Cadastral map geometry and reference integrity

This source checkpoint follows `41a8d2485bbf996149fa365c91bfb1411926c819`.
It repairs the shared parcel splitter consumed by the live map digitizing hook,
and the exported cadastral drawing/measurement interaction helpers. It is not
production promotion, accepted cadastral evidence or completion of the platform.

## Confirmed defects and resulting behavior

The previous shared splitter checked a drawn polyline for intersections, then
replaced it with a straight endpoint chord and a thin cutting rectangle. Bent
cuts could produce the wrong parcels. More than two faces could lose an entire
parcel because only the first two were returned. Corner cuts also lost measurable
area through the artificial cutter strip.

The splitter now delegates to `core/parcelSplit.ts`, which uses the actual
drawn interior path and both parent-boundary arcs. It requires a declared
projected survey CRS, a simple parent without holes, two distinct boundary
junctions and exactly one interior cut. It retains internal cut vertices and
existing parent corners, refuses crossing/overlapping/degenerate cuts and
multi-face outcomes, and checks finite positive child areas against the parent.
Boundary coincidence uses a coordinate-magnitude-dependent floating point
tolerance; that is numerical admission, not a certified positional accuracy.
Ill-conditioned near-parallel intersections are refused. Input arrays are not
mutated. No cutter strip, coordinate rounding or endpoint extrapolation is used.

The existing live `useDigitizingTools` path continues to transform geometry to
the declared grid before calling this shared splitter and display the resulting
two grid areas. It still refuses parent polygons with interior rings. Supporting
holes, multiple output parcels and ward-scale topology/concurrency remains work;
this two-parcel contract does not silently discard additional faces.

The exported subdivision interaction previously passed a polygon to Turf's
line-only split API behind unsafe casts. It now uses the same grid splitter,
converts source/display positions through the shared CRS authority and preserves
parent properties/style and lineage in the two returned features. It refuses
delivery if the parent geometry/source/revision changed during drawing. The
callback still controls replacement; the helper does not silently remove the
parent or persist derived geometry. Cleanup and abort detach owned listeners.

Drawing measurement previously defaulted to Web Mercator plane distances, guessed
a Kenyan UTM zone for geographic input and computed bearings in source coordinates.
Both source and project reference are now explicit, and the project reference
must pass the shared projected-survey gate before a layer is installed. Each
source position is converted to the declared grid, and distances/bearings use
`surveyDistance`/`surveyBearing`. Invalid geometry revokes previous and partial
labels. A coincident cursor has no invented north bearing. Completion refreshes
final labels, abort clears them and repeated cleanup is harmless.

The snapping setup assumed OpenLayers accepted a `sources` array. The installed
runtime accepts a single source or a feature Collection, so the previous secondary
source was ignored. A synchronized Collection now indexes both sources, follows
add/remove/clear operations and retains shared features until both sources remove
them. The same adapter is used by the exported editing stack and subdivision
helper. New tests exercise actual OpenLayers indexing instead of assuming the
unsupported option worked.

## Verification

The first new geometry/measurement run reproduced 15 failures in 20 tests;
the four interaction regressions also failed against the original helpers.
After repairs, all 237 tests across nine suites pass: split geometry, real
OpenLayers draw events, snapping, measurement lifecycle, legacy history,
editing handlers, shared CRS authority, single-implementation and wiring checks.
Rotated/reversed and translated bent cuts preserve independently known child
areas. Actual OpenLayers geometry, Draw, Snap, sources and layers run in these
tests; a deterministic map-host adapter replaces the browser renderer.

Application and strict test TypeScript checks pass. Scoped lint reports zero
errors or warnings across all seven changed code/test files. No rule, baseline
or test gate is relaxed. A runtime LineString import and a legacy mock isolation
gap found in the intermediate run were corrected. OpenLayers' Snap declaration
incorrectly excludes null for detachment; the test uses its base Interaction
public contract, which matches the runtime behavior.

Receipts are retained locally under `.cache/calibration-repair/` and
`.cache/cadastral-map-integrity/`, including source hashes. Local source checks,
browser appearance, synthetic/native persistence, deployed artifacts and field
accuracy remain separate evidence categories. No fresh browser rendering, mobile
gesture, receiving-CAD or physical-field acceptance is asserted here.

## Preserved runtime and remaining gates

The mandated existing-production verifier passes health and ownership checks:
one app container, required supporting services and the existing backup job.
Backup completion at 2026-10-28T02:00:04Z is archive/header evidence, not a restore
rehearsal. No service, migration, customer data, billing setting or CAD drawing
was changed. The earlier edit attempt stopped at an approval-review usage limit;
none of that rejected mutation was applied. Normal reviewed edits resumed later.

Full CI at the preceding checkpoint still has lint/browser/accessibility failures
and cancelled full Jest coverage, despite passing web/mobile builds, TypeScript,
security and native design/set-out checks. This checkpoint needs its own CI.
Production still runs older source. Worker artifact drift, migrations 115–123,
rollback identity, actual recovery, owner-deferred key rotation, authenticated
admin/UI/device checks, durable survey revisions and collaborative delivery,
ward-scale performance, provider/CAD/print and independent field acceptance
remain open. Exported helper tests are not proof that every product surface
has adopted those helpers or passed field acceptance.
