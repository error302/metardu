/**
 * core/measure — THE survey measurement path (plan §3.1 / F2 / §12.5).
 *
 * OpenLayers geometries live in the display projection (EPSG:3857). Web
 * Mercator lengths are inflated by sec(latitude) and areas by sec²(latitude);
 * showing those numbers to a surveyor is a statutory-scale error. Every
 * measurement therefore converts to the project CRS first and uses the
 * single survey math path in `@/lib/spatial/projectCrs`.
 *
 * (Moved verbatim from `src/app/map/utils/measureMath.ts`, Phase 1;
 * the old `utils/measureMath.ts` re-export shim was deleted in Phase 5.)
 *
 * Phase 5 addition: the CRS-agnostic planar helpers from the deleted
 * `lib/map/measurements.ts` shim live here too — they accept project-CRS
 * grid points (metres) and are pure local geometry. The deprecated CRS-less
 * `calculateDistance/calculateBearing/calculateArea` entry points are gone;
 * call `surveyDistance/surveyBearing/surveyArea` from
 * `@/lib/spatial/projectCrs` with an explicit CRS instead.
 */
import {
  fromDisplay,
  surveyArea,
  surveyBearing,
  surveyDistance,
  surveyPerimeter,
} from '@/lib/spatial/projectCrs';
import type { GridPoint } from './types';

/** Length of a polyline given in display-CRS coordinates, measured in the project CRS (m). */
export function polylineLengthInCrs(coords: number[][], crs: string): number {
  const pts = coords.map((c) => fromDisplay(c[0], c[1], crs))
  let length = 0
  for (let i = 1; i < pts.length; i++) {
    length += surveyDistance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], crs)
  }
  return length
}

/** Area of a display-CRS ring, measured in the project CRS (m²). */
export function polygonAreaInCrs(ring: number[][], crs: string): number {
  return surveyArea(ring.map((c) => fromDisplay(c[0], c[1], crs)), crs)
}

/** Perimeter of a display-CRS ring, measured in the project CRS (m). */
export function polygonPerimeterInCrs(ring: number[][], crs: string): number {
  return surveyPerimeter(ring.map((c) => fromDisplay(c[0], c[1], crs)), crs)
}

/** Whole-circle bearing first→last point of a display-CRS polyline (deg, [0,360)) or null. */
export function endpointsBearingInCrs(coords: number[][], crs: string): number | null {
  if (coords.length < 2) return null
  const pts = coords.map((c) => fromDisplay(c[0], c[1], crs))
  const first = pts[0]
  const last = pts[pts.length - 1]
  try {
    return surveyBearing(first[0], first[1], last[0], last[1], crs)
  } catch {
    return null
  }
}

// ─── Planar grid helpers (formerly lib/map/measurements.ts) ──────────────
// Pure Euclidean 2D math on project-CRS grid points. No CRS transform, no
// geodesy — call sites must already be in the project CRS.

/** Planar Euclidean distance between two grid points (metres). */
export function planarDistance(from: GridPoint, to: GridPoint): number {
  const dE = to.easting - from.easting;
  const dN = to.northing - from.northing;
  return Math.sqrt(dE * dE + dN * dN);
}

/** Planar perimeter of a grid ring (open or closed — closure segment included). */
export function calculatePerimeter(vertices: GridPoint[]): number {
  if (vertices.length < 2) return 0;
  let perimeter = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += planarDistance(vertices[i], vertices[j]);
  }
  return perimeter;
}

/** Centroid (vertex average) of a grid ring. */
export function calculateCentroid(vertices: GridPoint[]): GridPoint {
  if (vertices.length === 0) {
    return { easting: 0, northing: 0 };
  }
  let sumE = 0;
  let sumN = 0;
  for (const v of vertices) {
    sumE += v.easting;
    sumN += v.northing;
  }
  return {
    easting: sumE / vertices.length,
    northing: sumN / vertices.length,
  };
}

/** Bounding box of grid points. */
export function calculateBounds(vertices: GridPoint[]): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} {
  if (vertices.length === 0) {
    return { minE: 0, maxE: 0, minN: 0, maxN: 0 };
  }
  let minE = Infinity, maxE = -Infinity;
  let minN = Infinity, maxN = -Infinity;
  for (const v of vertices) {
    minE = Math.min(minE, v.easting);
    maxE = Math.max(maxE, v.easting);
    minN = Math.min(minN, v.northing);
    maxN = Math.max(maxN, v.northing);
  }
  return { minE, maxE, minN, maxN };
}

/** Ray-casting point-in-polygon test on grid coordinates. */
export function pointInPolygon(point: GridPoint, vertices: GridPoint[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].easting;
    const yi = vertices[i].northing;
    const xj = vertices[j].easting;
    const yj = vertices[j].northing;
    if (((yi > point.northing) !== (yj > point.northing)) &&
        (point.easting < (xj - xi) * (point.northing - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Midpoint of a grid segment. */
export function calculateMidpoint(from: GridPoint, to: GridPoint): GridPoint {
  return {
    easting: (from.easting + to.easting) / 2,
    northing: (from.northing + to.northing) / 2,
  };
}

/** Point at the segment midpoint, offset perpendicular (grid metres). */
export function calculateOffsetPoint(
  from: GridPoint,
  to: GridPoint,
  offset: number
): GridPoint {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return from;
  const px = -dy / len;
  const py = dx / len;
  const midE = (from.easting + to.easting) / 2;
  const midN = (from.northing + to.northing) / 2;
  return {
    easting: midE + px * offset,
    northing: midN + py * offset,
  };
}

/** Nearest vertex within tolerance (grid metres), else null. */
export function snapToVertex(
  point: GridPoint,
  vertices: GridPoint[],
  tolerance: number = 1.0
): GridPoint | null {
  let minDist = Infinity;
  let snapped: GridPoint | null = null;
  for (const v of vertices) {
    const d = planarDistance(point, v);
    if (d < tolerance && d < minDist) {
      minDist = d;
      snapped = v;
    }
  }
  return snapped;
}

/** Nearest point on a single segment within tolerance, else null. */
export function snapToLine(
  point: GridPoint,
  from: GridPoint,
  to: GridPoint,
  tolerance: number = 1.0
): GridPoint | null {
  const dx = to.easting - from.easting;
  const dy = to.northing - from.northing;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const t = ((point.easting - from.easting) * dx + (point.northing - from.northing) * dy) / len2;
  const tClamped = Math.max(0, Math.min(1, t));
  const proj: GridPoint = {
    easting: from.easting + tClamped * dx,
    northing: from.northing + tClamped * dy,
  };
  const dist = planarDistance(point, proj);
  if (dist <= tolerance) {
    return proj;
  }
  return null;
}
