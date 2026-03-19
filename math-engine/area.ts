import { Point2D, SurveyResult, ok, err } from "./types";
import { distanceBearing } from "./distance";

// ─── AREA COMPUTATION ─────────────────────────────────────────────────────────

export interface AreaResult {
  squareMetres: number;
  hectares: number;
  acres: number;
  squareFeet: number;
  perimeter: number;        // metres
  centroid: Point2D;
  pointCount: number;
}

/**
 * Coordinate (Shoelace / Gauss) method for polygon area.
 *
 * Formula:
 *   2A = Σ (Eᵢ × Nᵢ₊₁ − Eᵢ₊₁ × Nᵢ)
 *
 * Points may be given in clockwise OR anti-clockwise order — the absolute
 * value is taken. The polygon is automatically closed (last point → first point).
 *
 * @param points  Boundary vertices in order (minimum 3)
 */
export function coordinateArea(
  points: Point2D[]
): SurveyResult<AreaResult> {
  if (points.length < 3) {
    return err("Area calculation requires at least 3 points.");
  }

  const n = points.length;
  let crossSum = 0;
  let perimeter = 0;
  let cx = 0, cy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = points[i];
    const q = points[j];

    // Shoelace terms
    crossSum += p.easting * q.northing;
    crossSum -= q.easting * p.northing;

    // Perimeter
    const legResult = distanceBearing(p, q);
    if (legResult.ok) perimeter += legResult.value.distance;

    // Centroid accumulation
    const cross = p.easting * q.northing - q.easting * p.northing;
    cx += (p.easting + q.easting) * cross;
    cy += (p.northing + q.northing) * cross;
  }

  const squareMetres = Math.abs(crossSum) / 2;
  if (squareMetres === 0) {
    return err("All points are collinear — area is zero.");
  }

  const centroid: Point2D = {
    easting: cx / (6 * squareMetres),
    northing: cy / (6 * squareMetres),
  };

  return ok({
    squareMetres,
    hectares: squareMetres / 10_000,
    acres: squareMetres / 4_046.856_422,
    squareFeet: squareMetres * 10.763_910_4,
    perimeter,
    centroid,
    pointCount: n,
  });
}

/**
 * Subdivide a polygon into two parts along a line from vertex[splitFrom]
 * to vertex[splitTo]. Returns the areas of both sub-polygons.
 *
 * Useful for cadastral subdivision calculations.
 */
export interface SubdivisionResult {
  partA: AreaResult;
  partB: AreaResult;
  totalArea: AreaResult;
}

export function subdividePolygon(
  points: Point2D[],
  splitFrom: number,
  splitTo: number
): SurveyResult<SubdivisionResult> {
  const n = points.length;
  if (splitFrom < 0 || splitFrom >= n || splitTo < 0 || splitTo >= n) {
    return err("Split indices are out of range.");
  }
  if (splitFrom === splitTo) {
    return err("Split from and to cannot be the same vertex.");
  }

  // Build the two sub-polygons
  const [lo, hi] =
    splitFrom < splitTo
      ? [splitFrom, splitTo]
      : [splitTo, splitFrom];

  const partA = points.slice(lo, hi + 1);
  const partB = [...points.slice(hi), ...points.slice(0, lo + 1)];

  const areaA = coordinateArea(partA);
  const areaB = coordinateArea(partB);
  const areaTotal = coordinateArea(points);

  if (!areaA.ok) return areaA;
  if (!areaB.ok) return areaB;
  if (!areaTotal.ok) return areaTotal;

  return ok({ partA: areaA.value, partB: areaB.value, totalArea: areaTotal.value });
}
