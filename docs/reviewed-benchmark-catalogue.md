# Reviewed benchmark and reference lookup

The former online lookup embedded 15 unverified records, publisher claims and
verification dates. The nearest-beacon service cached that list as an offline
database. The separate nearby endpoint limited rows before proximity filtering
and substituted projected northing/easting (or zero) for latitude/longitude.
Those production paths now use the persisted reviewed source catalogue.
Original source is preserved outside public/build assets in
`docs/marketing/archive-unverified-concepts/`.

## Data and navigation

Eligible records have explicit projected metre grids, finite XY, source document,
publisher and country. A published height needs its own explicit vertical datum;
unknown height remains null and zero remains zero. An independent review must
match the current catalogue reviewer/time and retained source snapshot. Pending,
rejected, withdrawn, incomplete, display-only and geographic-coordinate records
are excluded. Catalogue review does not establish field verification or official
national-dataset authenticity.

Geographic navigation positions are transformed in PostGIS from the **original
XY and declared EPSG grid**, not the legacy geometry/SRID default. Navigation
radius filtering, geodesic distance ordering and type/name/country/region filters
precede pagination. Count remains correct even for an empty later page. Source
coordinates and height datum stay unchanged in the DTO. Review time is labelled
as catalogue review; no physical-verification date is invented. Actor identities
and private source-submission details are not returned.

Distances use [PostGIS geography distance](https://postgis.net/docs/ST_Distance.html)
in metres, converted to kilometres for navigation display. Radius filtering uses
[ST_DWithin](https://postgis.net/docs/ST_DWithin.html). A coincident point has a
null azimuth, matching [ST_Azimuth](https://postgis.net/docs/ST_Azimuth.html).
These are navigation results, not grid setting-out observations, field accuracy
or independently validated national datum transformations. Original project
adoption still requires same-grid and height-datum agreement in the dedicated
catalogue import workflow.

## APIs and interface

- `POST /api/benchmarks/search`: referenced search with paired optional WGS 84
  navigation coordinates, radius 0–500 km, name, type, published county/region,
  country, bounded limit and offset. It preserves the direct result-object shape.
- `GET /api/benchmarks/search?id=...`: a reviewed source by UUID, or not found.
  Country metadata comes from current eligible database records. Type metadata
  describes classifications and does not claim that records are available.
- `GET /api/beacons/nearest`: the existing direct navigation-object response,
  including real distances, nullable azimuths, full matched count and
  `fromCache:false` / `navigationOnly:true`.
- `GET /api/benchmarks/nearby`: preserves the array response, restricted to
  reviewed benchmark records; headers identify navigation-only results and total.

Routes authenticate through the normal wrapper/RLS context and return successful
responses with `private, no-store`. Inputs reject suffix parsing, missing
coordinate partners, invalid limits/radii and unsupported classifications.
Errors remain visible instead of producing sample data. The online benchmark
tab has a sign-in invitation, real country metadata, explicit source/grid/height
details, pagination, empty/error states and stale-request protection. Real tidal
source classification is supported by submission/review/search; it denotes a
published reference mark, not a live tide reading.

## Optional map references

The survey map now renders its primary survey layers before awaiting optional
GNSS source discovery. A ten-second request bound and map/grid-change cancellation
prevent stale reference overlays. An explicit pending/failure state replaces a
premature empty-result claim. The map identity includes its declared grid and
clears old clicked-coordinate labels on a reference change. Corrupt or unavailable
viewport storage cannot block initialization. Initialization errors are visible.

Later browser inspection exposed a separate parent-loader failure: the project
page used the legacy table proxy to read `project_reference_systems`, which that
proxy deliberately blocks. It ignored the error and falsely reported a missing
declaration. Current source uses the dedicated owner-gated project/reference APIs,
keeps request failures distinct, cancels stale loads, and validates finite source
coordinates against the declared grid. It does not widen proxy permissions.

Field-point fallback now uses `point_name` and an explicit matching source grid.
It renders points, including a single point, without inferring a parcel, area,
perimeter or original observation from their storage order. Invalid/incomplete
saved boundaries remain errors instead of being replaced with unrelated points.
Soft-deleted points are excluded by the reader. Private map data responses carry
`private, no-store`. Saved geometry changes refresh the display even if the
centroid stays unchanged; OpenStreetMap attribution remains visible.

The project map displays saved results read-only. Its former drag autosave could
overwrite computed coordinates without versioning or invalidating approval.
Corrections now direct the surveyor to the existing observation/computation
workflow. A future drawing-edit workflow must preserve original observations,
record source/reference versions and invalidate dependent QA before saving.
This does not establish historical boundary provenance or certification.

## Verification boundary

No new migration was required. The marked synthetic rehearsal remains at 108
matching migration entries; no customer data or historical checksum was changed.
`scripts/verify-benchmark-catalogue.mjs` passed 32 real PostgreSQL/route checks
(provider sessions only substituted). They cover independence/provenance,
private response headers, pagination counts, pending/withdrawn exclusion,
source-grid transforms despite stale legacy geometry, zero/unknown height,
coincident azimuth, two different grids and an analytic WGS 84 equatorial arc
reference of 111.319490793 metres. This does not establish national datum accuracy.

Twenty focused tests across six suites passed for catalogue clients/UI, current
public-reference contracts, map initialization while reference discovery is
unresolved, failure, cancellation and ten-second timeout cleanup. OpenLayers
map objects and secondary controls were mocked in the map sequencing tests;
these are not pixel/hardware proof or a measured page-speed benchmark. Strict
application/test checks and scoped lint are recorded in the source artifact.
CI runs the native catalogue verifier.

The benchmark package `sha256:c65dce447f991ff48aa5ffcc1816e1b29ed0dd2bd724ac97a58f3a54aef5a485`
passed a strict production build (217 pages), 18 real password-session HTTP
checks and actual desktop/mobile catalogue inspection. At a requested 390-pixel
mobile viewport, document width was 380 pixels with no horizontal overflow;
the feedback trigger was 44 pixels high and in document flow after the footer.
The synthetic browser account was suspended and its temporary password removed.
The isolated port-3010 container was separately inspected as healthy.

That package's actual project-map browser check failed at the parent loader above.
The subsequent loader/point-mode/refresh corrections have 20 focused tests, strict
source checks and a separate verification record; they must not be attributed to
the earlier image. Docker build elapsed lines showed a discontinuity, so the
compiler-reported 4.2 minutes is recorded without treating the elapsed-line total
as a performance benchmark. No OOM or memory-limit event was observed.

Provider OAuth, live HTTPS ChatGPT connection, official source ingestion,
service-worker/offline behavior, datum-grid validation and live deployment remain
separate gates. No fake offline reference availability is claimed.

## Packaged project-map verification and later visual corrections

The subsequent image
`sha256:2df6c300a71aa73be0995a8848afccb098a928582a2d4d75c01ea3d65a2b4976`
passed a strict production build (217 pages, compiler-reported 3.5 minutes),
startup verification of 108 matching migrations, and 14 real password-session
HTTP checks. Actual browser inspection at a 1280-by-900 desktop breakpoint
confirmed the saved boundary, a single point without a polygon/area annotation,
available primary navigation, and distinct visible errors for missing source
grid, incomplete boundary and missing project declaration. The preview on
loopback port 3011 was healthy. Synthetic credentials were retired and the
viewport override reset. See `test-results/project-map-http/` and
`test-results/project-map-browser/`. Map measurement/PDF output, mobile-map
interaction, physical field accuracy and crew access are not established by
these checks.

That inspection also exposed inherited white text on a light toolbar, upside-down
westward labels, unstyled attribution and a large initially open layer panel.
Later source sets readable toolbar colours, scopes attribution layout to the
project map, starts its layer panel collapsed and makes the toggle a keyboard
button. Canvas rotations now keep cardinal/diagonal labels upright; the old
coincident-point catch no longer invents a north bearing. Twenty-nine focused
tests across five suites, strict application/test checks and scoped lint passed.
These later visual corrections are not in the image above and require a further
packaged browser check. The source artifact preserves the verified package
hashes separately from the later adjustment hashes. Oblique projections/view
rotation and professional print scale/layout still need dedicated verification.
