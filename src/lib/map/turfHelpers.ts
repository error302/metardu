/**
 * @module turfHelpers
 *
 * Pure-computation geospatial helpers wrapping @turf/turf for Kenyan cadastral
 * surveying on Metardu.
 *
 * **CRS convention** — every public API accepts and returns EPSG:21037
 * (Arc 1960 / UTM Zone 37 South) coordinates expressed as `{easting, northing}`
 * (metres).  Internally, coordinates are round-tripped through proj4 to/from
 * WGS84 (EPSG:4326) so that turf can operate on geographic [lon, lat] values.
 *
 * No OpenLayers dependency — this module is safe for use in Node workers,
 * server-side code, and any environment where only numeric results are needed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A survey point on the Kenya cadastral grid (Arc 1960 / UTM 37 S). */
export interface SurveyPoint {
  easting: number;
  northing: number;
}

// ---------------------------------------------------------------------------
// Lazy-loaded turf & proj4 singletons
// ---------------------------------------------------------------------------

let _turf: any = null;
let _proj4: any = null;

/** Proj4 definition for Arc 1960 / UTM Zone 37 South. */
const EPSG_21037_DEF =
  '+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs';

/**
 * Ensures turf and proj4 are loaded (once, lazily on first call).
 * Idempotent — subsequent calls resolve instantly.
 */
async function ensureLoaded(): Promise<void> {
  if (!_turf) {
    const [turfMod, proj4Mod] = await Promise.all([
      import('@turf/turf'),
      import('proj4'),
    ]);
    _turf = turfMod;
    _proj4 = proj4Mod.default ?? proj4Mod;
    _proj4.defs('EPSG:21037', EPSG_21037_DEF);
  }
}

// ---------------------------------------------------------------------------
// CRS helpers — EPSG:21037 <-> WGS84 [lon, lat]
// ---------------------------------------------------------------------------

/**
 * Convert an EPSG:21037 (easting, northing) pair to a WGS84 [lon, lat]
 * coordinate suitable for use with turf.
 *
 * @param easting - Easting in metres (EPSG:21037).
 * @param northing - Northing in metres (EPSG:21037).
 * @returns Tuple `[longitude, latitude]` in degrees (WGS84).
 *
 * @example
 *   const [lon, lat] = await toTurfCoord(300000, 9840000);
 */
export async function toTurfCoord(
  easting: number,
  northing: number,
): Promise<[number, number]> {
  await ensureLoaded();
  const [lon, lat] = _proj4('EPSG:21037', 'EPSG:4326', [easting, northing]);
  return [lon, lat];
}

/**
 * Convert a WGS84 [lon, lat] coordinate (turf format) back to EPSG:21037.
 *
 * @param coord - `[longitude, latitude]` in degrees (WGS84).
 * @returns Object with `easting` and `northing` in metres.
 *
 * @example
 *   const { easting, northing } = await fromTurfCoord([36.82, -1.28]);
 */
export async function fromTurfCoord(
  coord: [number, number],
): Promise<SurveyPoint> {
  await ensureLoaded();
  const [easting, northing] = _proj4('EPSG:4326', 'EPSG:21037', coord);
  return { easting, northing };
}

/**
 * Convert an array of EPSG:21037 survey points to a turf {@link Polygon}.
 *
 * The ring is automatically closed if the first and last vertices differ.
 *
 * @param vertices - Array of `{easting, northing}` objects.
 * @returns A turf Polygon GeoJSON in WGS84.
 */
export async function polygonToTurf(
  vertices: SurveyPoint[],
): Promise<any> {
  await ensureLoaded();
  const ring = vertices.map((v) =>
    _proj4('EPSG:21037', 'EPSG:4326', [v.easting, v.northing]),
  );
  // Ensure the ring is closed
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
  }
  return _turf.polygon([ring]);
}

/**
 * Convert an array of EPSG:21037 survey points to a turf {@link LineString}.
 *
 * @param vertices - Array of `{easting, northing}` objects.
 * @returns A turf LineString GeoJSON in WGS84.
 */
export async function lineStringToTurf(
  vertices: SurveyPoint[],
): Promise<any> {
  await ensureLoaded();
  const coords = vertices.map((v) =>
    _proj4('EPSG:21037', 'EPSG:4326', [v.easting, v.northing]),
  );
  return _turf.lineString(coords);
}

// ---------------------------------------------------------------------------
// Internal: convert a turf geometry (Polygon / MultiPolygon) back to
// EPSG:21037 vertices.  Returns the exterior ring of the first polygon.
// ---------------------------------------------------------------------------

/**
 * Extract the outer-ring vertices from a turf Polygon or MultiPolygon and
 * convert them to EPSG:21037.
 *
 * For a MultiPolygon, only the first polygon's exterior ring is returned.
 *
 * @param geo - A turf Polygon or MultiPolygon GeoJSON.
 * @returns Array of `{easting, northing}` vertices (ring is **not** closed).
 */
async function turfToVertices(geo: any): Promise<SurveyPoint[]> {
  await ensureLoaded();

  let exteriorRing: number[][];

  if (geo.geometry) {
    geo = geo.geometry;
  }

  if (geo.type === 'Polygon') {
    exteriorRing = geo.coordinates[0];
  } else if (geo.type === 'MultiPolygon') {
    exteriorRing = geo.coordinates[0][0];
  } else {
    throw new Error(
      `turfToVertices: unsupported geometry type "${geo.type}"`,
    );
  }

  return exteriorRing.map((c: number[]) => {
    const [easting, northing] = _proj4('EPSG:4326', 'EPSG:21037', c);
    return { easting, northing };
  });
}

// ---------------------------------------------------------------------------
// Survey analysis functions
// ---------------------------------------------------------------------------

/**
 * Calculate the area of a parcel in **square metres** using
 * {@link https://turfjs.org/docs/#area turf.area}.
 *
 * @param vertices - Parcel boundary as `{easting, northing}` vertices.
 * @returns Area in m². Returns `0` when fewer than 3 vertices are supplied.
 */
export async function calculateParcelAreaSqM(
  vertices: SurveyPoint[],
): Promise<number> {
  if (vertices.length < 3) return 0;
  const poly = await polygonToTurf(vertices);
  return _turf.area(poly);
}

/**
 * Calculate the perimeter of a parcel in **metres** using
 * {@link https://turfjs.org/docs/#length turf.length}.
 *
 * @param vertices - Parcel boundary as `{easting, northing}` vertices.
 * @returns Perimeter in metres. Returns `0` when fewer than 2 vertices are supplied.
 */
export async function calculateParcelPerimeterM(
  vertices: SurveyPoint[],
): Promise<number> {
  if (vertices.length < 2) return 0;
  const line = await lineStringToTurf(vertices);
  return _turf.length(line, { units: 'meters' });
}

/**
 * Buffer a single survey point by a given radius.
 *
 * Produces a polygon in EPSG:21037 that approximates a circle of the
 * requested radius on the ground.
 *
 * @param easting  - Easting of the centre point (m).
 * @param northing - Northing of the centre point (m).
 * @param radiusM  - Buffer radius in metres.
 * @returns Array of `{easting, northing}` vertices describing the buffer
 *          polygon.
 */
export async function bufferPoint(
  easting: number,
  northing: number,
  radiusM: number,
): Promise<SurveyPoint[]> {
  await ensureLoaded();
  const [lon, lat] = await toTurfCoord(easting, northing);
  const pt = _turf.point([lon, lat]);
  const buffered = _turf.buffer(pt, radiusM, { units: 'meters', steps: 32 });
  return turfToVertices(buffered);
}

/**
 * Buffer a parcel polygon by a given distance.
 *
 * A positive `distanceM` expands the parcel; a negative value contracts it.
 *
 * @param vertices  - Parcel boundary vertices.
 * @param distanceM - Buffer distance in metres (negative to shrink).
 * @returns New array of vertices representing the buffered parcel.
 */
export async function bufferParcel(
  vertices: SurveyPoint[],
  distanceM: number,
): Promise<SurveyPoint[]> {
  const poly = await polygonToTurf(vertices);
  const buffered = _turf.buffer(poly, distanceM, {
    units: 'meters',
    steps: 32,
  });
  return turfToVertices(buffered);
}

/**
 * Calculate the geometric intersection of two parcels.
 *
 * @param parcel1 - First parcel boundary vertices.
 * @param parcel2 - Second parcel boundary vertices.
 * @returns Vertices of the intersection polygon, or `null` if the parcels
 *          do not overlap (or the intersection is degenerate).
 */
export async function calculateIntersection(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
): Promise<SurveyPoint[] | null> {
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1),
    polygonToTurf(parcel2),
  ]);
  const intersection = _turf.intersect(poly1, poly2);
  if (!intersection) return null;

  // intersect can return a GeometryCollection with no area
  if (intersection.geometry && intersection.geometry.type === 'GeometryCollection') {
    // Try to find a polygon inside the collection
    const polys = intersection.geometry.geometries.filter(
      (g: any) => g.type === 'Polygon' || g.type === 'MultiPolygon',
    );
    if (polys.length === 0) return null;
    // Rebuild from the first valid polygon
    const first = polys[0];
    const rebuilt =
      first.type === 'MultiPolygon'
        ? _turf.multiPolygon(first.coordinates)
        : _turf.polygon(first.coordinates);
    return turfToVertices(rebuilt);
  }

  return turfToVertices(intersection);
}

/**
 * Calculate the geometric union of two parcels.
 *
 * @param parcel1 - First parcel boundary vertices.
 * @param parcel2 - Second parcel boundary vertices.
 * @returns Vertices of the combined (union) parcel.
 */
export async function calculateUnion(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
): Promise<SurveyPoint[]> {
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1),
    polygonToTurf(parcel2),
  ]);
  const union = _turf.union(poly1, poly2);
  return turfToVertices(union);
}

/**
 * Calculate the geometric difference of two parcels (parcel1 minus parcel2).
 *
 * @param parcel1 - Source parcel (the parcel to subtract *from*).
 * @param parcel2 - Subtract parcel (the parcel to remove).
 * @returns Vertices of the resulting parcel, or `null` if parcel2 fully
 *          contains parcel1 (nothing remains).
 */
export async function calculateDifference(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
): Promise<SurveyPoint[] | null> {
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1),
    polygonToTurf(parcel2),
  ]);
  const diff = _turf.difference(poly1, poly2);
  if (!diff) return null;

  // difference can return a GeometryCollection when there's nothing left
  if (diff.geometry && diff.geometry.type === 'GeometryCollection') {
    const polys = diff.geometry.geometries.filter(
      (g: any) => g.type === 'Polygon' || g.type === 'MultiPolygon',
    );
    if (polys.length === 0) return null;
    const first = polys[0];
    const rebuilt =
      first.type === 'MultiPolygon'
        ? _turf.multiPolygon(first.coordinates)
        : _turf.polygon(first.coordinates);
    return turfToVertices(rebuilt);
  }

  return turfToVertices(diff);
}

/**
 * Test whether a survey point lies inside a parcel boundary.
 *
 * Uses {@link https://turfjs.org/docs/#booleanPointInPolygon
 * turf.booleanPointInPolygon}.
 *
 * @param easting        - Easting of the query point (m).
 * @param northing       - Northing of the query point (m).
 * @param parcelVertices - Parcel boundary vertices.
 * @returns `true` if the point is inside (or on the boundary of) the parcel.
 */
export async function isPointInParcel(
  easting: number,
  northing: number,
  parcelVertices: SurveyPoint[],
): Promise<boolean> {
  if (parcelVertices.length < 3) return false;
  const [lon, lat] = await toTurfCoord(easting, northing);
  const pt = _turf.point([lon, lat]);
  const poly = await polygonToTurf(parcelVertices);
  return _turf.booleanPointInPolygon(pt, poly);
}

/**
 * Calculate the Polsby-Popper compactness score for a parcel.
 *
 * The score ranges from 0 (highly elongated / irregular) to 1 (a perfect
 * circle).  It is defined as:
 *
 * ```
 * C = 4π × A / P²
 * ```
 *
 * where *A* is the area in m² and *P* is the perimeter in m.
 *
 * Useful for flagging unusually shaped parcels that may indicate boundary
 * disputes or survey errors in Kenyan land records.
 *
 * @param vertices - Parcel boundary vertices.
 * @returns Compactness score between 0 and 1. Returns `0` when fewer than 3
 *          vertices are supplied.
 */
export async function calculateCompactness(
  vertices: SurveyPoint[],
): Promise<number> {
  if (vertices.length < 3) return 0;

  const [areaSqM, perimeterM] = await Promise.all([
    calculateParcelAreaSqM(vertices),
    calculateParcelPerimeterM(vertices),
  ]);

  if (perimeterM === 0) return 0;

  return (4 * Math.PI * areaSqM) / (perimeterM * perimeterM);
}
