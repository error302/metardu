/** Geospatial helpers using the caller's declared projected CRS.
 * Turf operates in WGS84; project transformations use the shared CRS authority.
 * Turf areas and lengths are spherical estimates, not statutory acceptance.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { Point2D } from '@/types/surveyPoint'

import type { Feature, LineString, MultiPolygon, Polygon } from 'geojson'

import { assertProjectedCrs, transformPoint } from '@/lib/spatial/projectCrs'

/**
 * A survey point on the Kenya cadastral grid.
 *
 * Re-exported from the canonical `Point2D` for backwards compatibility with
 * existing call sites that import `{ SurveyPoint }` from this module. New
 * code should import `Point2D` directly from `@/types/surveyPoint`.
 */
export type SurveyPoint = Point2D

// ---------------------------------------------------------------------------
// Lazy-loaded turf & proj4 singletons
// ---------------------------------------------------------------------------

type TurfModule = typeof import('@turf/turf')

let _turf: TurfModule | null = null;
async function ensureLoaded(): Promise<void> {
  _turf ??= await import('@turf/turf');
}
async function getTurf(): Promise<TurfModule> {
  await ensureLoaded();
  if (!_turf) throw new Error('Turf did not load');
  return _turf;
}

function project(x: number, y: number, from: string, to: string): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Coordinates must be finite');
  const result = transformPoint(x, y, from, to);
  if (!result.every(Number.isFinite)) throw new RangeError('Coordinate transformation failed');
  return result;
}

// ---------------------------------------------------------------------------
// CRS helpers — Kenya UTM <-> WGS84 [lon, lat]
// ---------------------------------------------------------------------------

/**
 * Convert a UTM (easting, northing) pair to a WGS84 [lon, lat]
 * coordinate suitable for use with turf.
 *
 * @param easting - Easting in metres.
 * @param northing - Northing in metres.
 * @param epsg - Source EPSG code (required project CRS).
 * @returns Tuple `[longitude, latitude]` in degrees (WGS84).
 *
 * @example
 *   const [lon, lat] = await toTurfCoord(300000, 9840000);               // Zone 37S
 *   const [lon, lat] = await toTurfCoord(300000, 9840000, 'EPSG:21036'); // Zone 36S
 */
export async function toTurfCoord(
  easting: number,
  northing: number,
  epsg: string,
): Promise<[number, number]> {
  assertProjectedCrs(epsg);
  const [lon, lat] = project(easting, northing, epsg, 'EPSG:4326');
  return [lon, lat];
}

/**
 * Convert a WGS84 [lon, lat] coordinate (turf format) back to UTM.
 *
 * @param coord - `[longitude, latitude]` in degrees (WGS84).
 * @param epsg - Target EPSG code (required project CRS).
 * @returns Object with `easting` and `northing` in metres.
 *
 * @example
 *   const { easting, northing } = await fromTurfCoord([36.82, -1.28]);
 *   const { easting, northing } = await fromTurfCoord([34.75, -0.10], 'EPSG:21036');
 */
export async function fromTurfCoord(
  coord: [number, number],
  epsg: string,
): Promise<SurveyPoint> {
  assertProjectedCrs(epsg);
  await ensureLoaded();
  const [easting, northing] = project(coord[0], coord[1], 'EPSG:4326', epsg);
  return { easting, northing };
}

/**
 * Convert an array of UTM survey points to a turf {@link Polygon}.
 *
 * The ring is automatically closed if the first and last vertices differ.
 *
 * @param vertices - Array of `{easting, northing}` objects.
 * @param epsg - Source EPSG code (required project CRS).
 * @returns A turf Polygon GeoJSON in WGS84.
 */
export async function polygonToTurf(
  vertices: SurveyPoint[],
  epsg: string,
): Promise<Feature<Polygon>> {
  assertProjectedCrs(epsg);
  await ensureLoaded();
  const ring = vertices.map((v) =>
    project(v.easting, v.northing, epsg, 'EPSG:4326'),
  );
  // Ensure the ring is closed
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
  }
  return (await getTurf()).polygon([ring]);
}

/**
 * Convert an array of UTM survey points to a turf {@link LineString}.
 *
 * @param vertices - Array of `{easting, northing}` objects.
 * @param epsg - Source EPSG code (required project CRS).
 * @returns A turf LineString GeoJSON in WGS84.
 */
export async function lineStringToTurf(
  vertices: SurveyPoint[],
  epsg: string,
): Promise<Feature<LineString>> {
  assertProjectedCrs(epsg);
  await ensureLoaded();
  const coords = vertices.map((v) =>
    project(v.easting, v.northing, epsg, 'EPSG:4326'),
  );
  return (await getTurf()).lineString(coords);
}

// ---------------------------------------------------------------------------
// Internal: convert a turf geometry (Polygon / MultiPolygon) back to
// UTM vertices.  Returns the exterior ring of the first polygon.
// ---------------------------------------------------------------------------

/**
 * Extract the outer-ring vertices from a turf Polygon or MultiPolygon and
 * convert them to UTM.
 *
 * For a MultiPolygon, only the first polygon's exterior ring is returned.
 *
 * @param geo - A turf Polygon or MultiPolygon GeoJSON.
 * @param epsg - Target EPSG code (required project CRS).
 * @returns Array of `{easting, northing}` vertices (ring is **not** closed).
 */
type TurfPolygonGeom =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

async function turfToVertices(
  geo: Feature<Polygon | MultiPolygon> | TurfPolygonGeom,
  epsg: string,
): Promise<SurveyPoint[]> {
  assertProjectedCrs(epsg);
  await ensureLoaded();

  let g: TurfPolygonGeom;
  if ('geometry' in geo && geo.geometry) {
    g = geo.geometry;
  } else if (geo.type === 'Polygon' || geo.type === 'MultiPolygon') {
    g = geo;
  } else {
    const t = typeof geo === 'object' && geo !== null ? String((geo as { type?: unknown }).type ?? 'unknown') : 'unknown'
    throw new Error(`turfToVertices: unsupported geometry type "${t}"`);
  }

  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
    throw new Error(`turfToVertices: unsupported geometry type "${String((g as { type?: unknown }).type)}"`);
  }
  const exteriorRing: number[][] = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];

  return exteriorRing.map((c: number[]) => {
    const [easting, northing] = project(c[0], c[1], 'EPSG:4326', epsg);
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
 * @param epsg - Source EPSG code (required project CRS).
 * @returns Area in m². Returns `0` when fewer than 3 vertices are supplied.
 */
export async function calculateParcelAreaSqM(
  vertices: SurveyPoint[],
  epsg: string,
): Promise<number> {
  assertProjectedCrs(epsg);
  if (vertices.length < 3) return 0;
  const poly = await polygonToTurf(vertices, epsg);
  return (await getTurf()).area(poly);
}

/**
 * Calculate the perimeter of a parcel in **metres** using
 * {@link https://turfjs.org/docs/#length turf.length}.
 *
 * @param vertices - Parcel boundary as `{easting, northing}` vertices.
 * @param epsg - Source EPSG code (required project CRS).
 * @returns Perimeter in metres. Returns `0` when fewer than 2 vertices are supplied.
 */
export async function calculateParcelPerimeterM(
  vertices: SurveyPoint[],
  epsg: string,
): Promise<number> {
  assertProjectedCrs(epsg);
  if (vertices.length < 2) return 0;
  const line = await lineStringToTurf(vertices, epsg);
  return (await getTurf()).length(line, { units: 'meters' });
}

/**
 * Buffer a single survey point by a given radius.
 *
 * Produces a polygon in the given EPSG that approximates a circle of the
 * requested radius on the ground.
 *
 * @param easting  - Easting of the centre point (m).
 * @param northing - Northing of the centre point (m).
 * @param radiusM  - Buffer radius in metres.
 * @param epsg - Source/target EPSG code (required project CRS).
 * @returns Array of `{easting, northing}` vertices describing the buffer
 *          polygon.
 */
export async function bufferPoint(
  easting: number,
  northing: number,
  radiusM: number,
  epsg: string,
): Promise<SurveyPoint[]> {
  assertProjectedCrs(epsg);
  await ensureLoaded();
  const [lon, lat] = await toTurfCoord(easting, northing, epsg);
  const pt = (await getTurf()).point([lon, lat]);
  const buffered = (await getTurf()).buffer(pt, radiusM, { units: 'meters', steps: 32 });
  if (!buffered) return [];
  return turfToVertices(buffered, epsg);
}

/**
 * Buffer a parcel polygon by a given distance.
 *
 * A positive `distanceM` expands the parcel; a negative value contracts it.
 *
 * @param vertices  - Parcel boundary vertices.
 * @param distanceM - Buffer distance in metres (negative to shrink).
 * @param epsg - Source/target EPSG code (required project CRS).
 * @returns New array of vertices representing the buffered parcel.
 */
export async function bufferParcel(
  vertices: SurveyPoint[],
  distanceM: number,
  epsg: string,
): Promise<SurveyPoint[]> {
  assertProjectedCrs(epsg);
  const poly = await polygonToTurf(vertices, epsg);
  const buffered = (await getTurf()).buffer(poly, distanceM, {
    units: 'meters',
    steps: 32,
  });
  if (!buffered) return [];
  return turfToVertices(buffered, epsg);
}

/**
 * Calculate the geometric intersection of two parcels.
 *
 * @param parcel1 - First parcel boundary vertices.
 * @param parcel2 - Second parcel boundary vertices.
 * @param epsg - Source/target EPSG code (required project CRS).
 * @returns Vertices of the intersection polygon, or `null` if the parcels
 *          do not overlap (or the intersection is degenerate).
 */
export async function calculateIntersection(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
  epsg: string,
): Promise<SurveyPoint[] | null> {
  assertProjectedCrs(epsg);
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1, epsg),
    polygonToTurf(parcel2, epsg),
  ]);
  const turf = await getTurf();
  const intersection = turf.intersect(turf.featureCollection([poly1, poly2]));
  if (!intersection) return null;

  // intersect can return a GeometryCollection with no area (runtime reality
  // despite turf's narrower TS types)
  const interGeom = intersection.geometry as
    | { type: 'GeometryCollection'; geometries: Array<{ type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][][] | number[][][] }> }
    | { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  if (interGeom.type === 'GeometryCollection') {
    // Try to find a polygon inside the collection
    const polys = interGeom.geometries.filter(
      (g): g is { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } =>
        g.type === 'Polygon' || g.type === 'MultiPolygon',
    );
    if (polys.length === 0) return null;
    // Rebuild from the first valid polygon
    const first = polys[0];
    const rebuilt =
      first.type === 'MultiPolygon'
        ? (await getTurf()).multiPolygon(first.coordinates)
        : (await getTurf()).polygon(first.coordinates);
    return turfToVertices(rebuilt, epsg);
  }

  return turfToVertices(intersection, epsg);
}

/**
 * Calculate the geometric union of two parcels.
 *
 * @param parcel1 - First parcel boundary vertices.
 * @param parcel2 - Second parcel boundary vertices.
 * @param epsg - Source/target EPSG code (required project CRS).
 * @returns Vertices of the combined (union) parcel.
 */
export async function calculateUnion(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
  epsg: string,
): Promise<SurveyPoint[]> {
  assertProjectedCrs(epsg);
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1, epsg),
    polygonToTurf(parcel2, epsg),
  ]);
  const turf = await getTurf();
  const union = turf.union(turf.featureCollection([poly1, poly2]));
  if (!union) return [];
  return turfToVertices(union, epsg);
}

/**
 * Calculate the geometric difference of two parcels (parcel1 minus parcel2).
 *
 * @param parcel1 - Source parcel (the parcel to subtract *from*).
 * @param parcel2 - Subtract parcel (the parcel to remove).
 * @param epsg - Source/target EPSG code (required project CRS).
 * @returns Vertices of the resulting parcel, or `null` if parcel2 fully
 *          contains parcel1 (nothing remains).
 */
export async function calculateDifference(
  parcel1: SurveyPoint[],
  parcel2: SurveyPoint[],
  epsg: string,
): Promise<SurveyPoint[] | null> {
  assertProjectedCrs(epsg);
  const [poly1, poly2] = await Promise.all([
    polygonToTurf(parcel1, epsg),
    polygonToTurf(parcel2, epsg),
  ]);
  const turf = await getTurf();
  const diff = turf.difference(turf.featureCollection([poly1, poly2]));
  if (!diff) return null;

  // difference can return a GeometryCollection when there's nothing left
  // (runtime reality despite turf's narrower TS types)
  const diffGeom = diff.geometry as
    | { type: 'GeometryCollection'; geometries: Array<{ type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][][] | number[][][] }> }
    | { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  if (diffGeom.type === 'GeometryCollection') {
    const polys = diffGeom.geometries.filter(
      (g): g is { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } =>
        g.type === 'Polygon' || g.type === 'MultiPolygon',
    );
    if (polys.length === 0) return null;
    const first = polys[0];
    const rebuilt =
      first.type === 'MultiPolygon'
        ? (await getTurf()).multiPolygon(first.coordinates)
        : (await getTurf()).polygon(first.coordinates);
    return turfToVertices(rebuilt, epsg);
  }

  return turfToVertices(diff, epsg);
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
 * @param epsg - Source EPSG code (required project CRS).
 * @returns `true` if the point is inside (or on the boundary of) the parcel.
 */
export async function isPointInParcel(
  easting: number,
  northing: number,
  parcelVertices: SurveyPoint[],
  epsg: string,
): Promise<boolean> {
  assertProjectedCrs(epsg);
  if (parcelVertices.length < 3) return false;
  const [lon, lat] = await toTurfCoord(easting, northing, epsg);
  const pt = (await getTurf()).point([lon, lat]);
  const poly = await polygonToTurf(parcelVertices, epsg);
  return (await getTurf()).booleanPointInPolygon(pt, poly);
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
 * @param epsg - Source EPSG code (required project CRS).
 * @returns Compactness score between 0 and 1. Returns `0` when fewer than 3
 *          vertices are supplied.
 */
export async function calculateCompactness(
  vertices: SurveyPoint[],
  epsg: string,
): Promise<number> {
  assertProjectedCrs(epsg);
  if (vertices.length < 3) return 0;

  const [areaSqM, perimeterM] = await Promise.all([
    calculateParcelAreaSqM(vertices, epsg),
    calculateParcelPerimeterM(vertices, epsg),
  ]);

  if (perimeterM === 0) return 0;

  return (4 * Math.PI * areaSqM) / (perimeterM * perimeterM);
}

