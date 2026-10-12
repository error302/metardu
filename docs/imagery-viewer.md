# Survey-planning imagery

The `/online` imagery tab uses the existing OpenLayers dependency. Coordinates
are explicit WGS 84 navigation coordinates. No tiles are requested until the user
supplies a location and selects **View imagery**. The map supports pan/zoom,
keyboard navigation, an expanded modal view and Escape/close restoration.

## Sources and evidence

- **Esri World Imagery** is identified as a mixed-source online basemap. Copyright
  credits, supported tile-grid origin and resolutions come from its current
  service metadata. Acquisition date and local source pixel size remain unknown.
  The source item's export guidance says that this service is not intended for
  offline tile export. METARDU therefore does not create its GIS raster ZIP from
  this source. A separately licensed export/orthophoto workflow is still needed.
- **NASA MODIS / Terra corrected-reflectance true colour** is dated regional
  imagery, not Sentinel-2 or parcel-resolution imagery. The selected data day,
  publication calendar and its gaps come from the WMTS declaration. The default
  data day is not the workstation date. The visualization grid is nominally
  250 metres; its native colour bands include 250- and 500-metre observations.
  A data day does not establish the acquisition time or positional accuracy.
  Clouds and missing source data can remain visible even after tiles load.

Authoritative references:

- [NASA GIBS service, projection and time dimensions](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [MODIS / Terra true-colour visualization](https://gis.earthdata.nasa.gov/portal/home/item.html?id=780c03ffe3dc42e8bb03ca3b07bb283e)
- [NASA data-use and citation guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy)
- [Esri World Imagery source item and export guidance](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)
- [Esri service metadata](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson)

Unverified aliases, Google tile URLs, invented current acquisition dates,
geography-based resolution claims and the unused RGB/NDVI classification helper
were removed from active code. The original service is retained only in
`docs/marketing/archive-unverified-concepts/satellite-service-unverified-2026-10-09.ts`.

## Metadata delivery and viewer integrity

`GET /api/imagery/catalogue` reads two fixed public endpoints. It receives no
project ID, user coordinates or private field data. Responses preserve the
platform-wide `private, no-store` API policy. Server reads
share one pending operation and a 15-minute success cache, with a 12-second
request bound and eight-megabyte response limit. XML entity/DOCTYPE declarations
are rejected. Tile URLs, calendar periods, Web Mercator authority, tile size,
origin and resolution grid are validated. A provider failure stays explicit.
`fast-xml-parser` 5.8.0 was already installed transitively and is now a declared
direct server dependency; no second mapping engine or native GIS stack was added.

The viewer itself has a 20-second metadata bound. Inputs/source/date changes clear
old views and abort their controllers. OpenLayers and its tile machinery load on
demand; ZIP assembly loads only during export. The app's image policy permits the
specific NASA GIBS host. Source credits are escaped before entering attribution
HTML. The map owns and disposes its layer/source, bounds the tile cache, and
reports stalled/failed/out-of-grid views. Export requires loaded tiles for the
actual current camera, not a previous ready state.

## Raster export

The NASA GIS ZIP contains:

| File | Use |
| --- | --- |
| `imagery.png` | Rendered viewport raster, without a caption altering its extent |
| `imagery.pgw` | Six affine coefficients in A,D,B,E,C,F order; origin at the top-left pixel centre |
| `imagery.prj` | EPSG:3857 WKT generated from the installed PROJ database through pyproj 3.7.2 |
| `reference-map.png` | Separate company-branded image with source credits for report/reference use |
| `provenance.json` | Dimensions, full affine, raster SHA-256, requested data day, source/terms/credits and capture timestamps |
| `README.txt` | GIS loading instructions and interpretation limits |

The frame is copied before asynchronous encoding, branding or ZIP assembly.
Preparation has explicit PNG, logo and ZIP time bounds. A completed export offers
a persistent download link inside the map, including its expanded modal; errors
are also inside that modal. Changing the source or coordinates invalidates a
pending export and revokes any previously prepared object URL.
Pixel-centre and adjacent-pixel coordinates determine the full affine, including
rotation. The raster projection is a display CRS; exported pixel spacing is not
sensor resolution or a survey-distance authority. Metadata keeps acquisition
time, positional accuracy and field verification unknown. Browse RGB pixels are
not calibrated spectral bands for NDVI. The separate reference image is not the
georeferenced raster. The canonical `/metardu-icon.png` is used for branding.

[World-file pixel-centre convention](https://pro.arcgis.com/en/pro-app/3.6/help/data/imagery/world-files-for-raster-datasets.htm)
and [PROJ's Web Mercator definition](https://proj.org/en/stable/operations/projections/webmerc.html)
are the format/projection references. Live GIS application import, printed-scale
accuracy, orthophoto/GeoTIFF ingestion and survey acceptance remain separate checks.

## Verification boundary

The source artifact records 52 passing focused tests across nine suites,
strict application/test checks, scoped lint, two live metadata reads and one real
NASA JPEG response with valid 256-by-256 dimensions and cross-origin permission.
The map readiness tests use real OpenLayers view/source/tile-grid classes but a
substituted map renderer. These do not establish pixel rendering or field accuracy.

The first combined package compiled and produced an isolated healthy image.
Actual browser viewing verified both sources, source credits and Esri export
restrictions. It exposed native dialog size limits and an unverified automatic
download. Source corrections provide an explicit download link, visible modal
errors, preparation time bounds and removal of native dialog size limits. The
corrected image `sha256:f0431b8dc1f56a85bf2b6bd0503ec7aeaef71bf9b979535355add98df8581a96`
built successfully, passed strict production types, generated 217 pages and passed
10 actual HTTP checks. Browser evidence shows both sources rendering, NASA ZIP
preparation, a persistent download link, source-change cleanup and the Esri export
restriction. The 390-pixel mobile layout has no horizontal overflow and retains
navigation. Closing the expanded view restores page navigation.

Actual file transfer timed out through both the in-app browser and Chrome; Chrome
control subsequently became unavailable. No downloaded ZIP bytes or external GIS
import have been verified, and Escape restoration has not been proven in a native
browser. The expanded view inherited a 20-pixel margin from page spacing, and the
mobile title still said Datum Converter. Follow-up source replaces margin-based
spacing with flex gap, invalidates prepared exports on camera changes and corrects
Online Services labels in all 14 locales. Those follow-ups pass 27 imagery tests
but are not yet in the browser-tested image. Independent archive/projection/affine/
hash checks and the follow-up package are still required. No customer deployment,
data or migration history has changed. See `test-results/imagery-viewer/` for the
recorded boundary.
