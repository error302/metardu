import { Point2D, NamedPoint2D, SurveyResult, ok, err } from "./types";
import { toRadians, toDegrees, normalizeBearing } from "./angles";
import { distanceBearing, polarPoint } from "./distance";

// ─── COGO — COORDINATE GEOMETRY ───────────────────────────────────────────────

/**
 * RADIATION
 * Compute the position of an unknown point given:
 *   - instrument station (known)
 *   - bearing to the unknown point
 *   - distance to the unknown point
 *
 * This is the most common field operation with a total station.
 */
export function radiation(
  instrument: Point2D,
  bearingDeg: number,
  distance: number
): SurveyResult<Point2D> {
  return polarPoint(instrument, bearingDeg, distance);
}

/**
 * INTERSECTION (bearing-bearing)
 * Compute the position of an unknown point from two known stations
 * by observing bearings to it from each station.
 *
 * @param stationA  Known point A
 * @param bearingA  Bearing from A to unknown point (whole-circle, decimal degrees)
 * @param stationB  Known point B
 * @param bearingB  Bearing from B to unknown point
 */
export interface IntersectionResult {
  point: Point2D;
  distanceFromA: number;
  distanceFromB: number;
}

export function bearingIntersection(
  stationA: Point2D,
  bearingA: number,
  stationB: Point2D,
  bearingB: number
): SurveyResult<IntersectionResult> {
  const a1 = toRadians(bearingA);
  const a2 = toRadians(bearingB);

  // Direction vectors
  const dx1 = Math.sin(a1), dy1 = Math.cos(a1);
  const dx2 = Math.sin(a2), dy2 = Math.cos(a2);

  // Solve: A + t·d1 = B + s·d2
  const denom = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(denom) < 1e-10) {
    return err("Bearings are parallel — no unique intersection point.");
  }

  const dEx = stationB.easting - stationA.easting;
  const dNy = stationB.northing - stationA.northing;

  const t = (dEx * dy2 - dNy * dx2) / denom;

  const point: Point2D = {
    easting: stationA.easting + t * dx1,
    northing: stationA.northing + t * dy1,
  };

  const s = (dEx * dy1 - dNy * dx1) / denom;

  if (t < 0 || s < 0) {
    return err(
      "Intersection point is behind one or both stations — check bearings."
    );
  }

  const distA = distanceBearing(stationA, point);
  const distB = distanceBearing(stationB, point);

  return ok({
    point,
    distanceFromA: distA.ok ? distA.value.distance : 0,
    distanceFromB: distB.ok ? distB.value.distance : 0,
  });
}

/**
 * RESECTION (Three-point problem — Tienstra method)
 * Compute the position of the instrument station from three known points
 * and the horizontal angles between them.
 *
 * This is one of the most powerful free-stationing operations.
 *
 * @param p1, p2, p3  Three known control points, observed in clockwise order
 * @param alpha       Horizontal angle P1–Instrument–P2 (decimal degrees)
 * @param beta        Horizontal angle P2–Instrument–P3 (decimal degrees)
 */
export interface ResectionResult {
  instrumentStation: Point2D;
  residuals: number[];  // angular residuals in seconds (quality indicator)
}

export function tienstraResection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  alpha: number,   // angle at instrument between P1 and P2, decimal degrees
  beta: number     // angle at instrument between P2 and P3, decimal degrees
): SurveyResult<ResectionResult> {
  if (alpha <= 0 || beta <= 0 || alpha + beta >= 360) {
    return err("Angles alpha and beta must be positive and sum to less than 360°.");
  }

  // Tienstra's formula
  const A = toRadians(alpha);
  const B = toRadians(beta);

  // Cotangents
  const cotA = 1 / Math.tan(A);
  const cotB = 1 / Math.tan(B);

  // Angles of the triangle P1P2P3
  const db12 = distanceBearing(p1, p2);
  const db23 = distanceBearing(p2, p3);
  const db31 = distanceBearing(p3, p1);

  if (!db12.ok || !db23.ok || !db31.ok) {
    return err("Could not compute distances between control points.");
  }

  // Angles at each control point using cosine rule
  const a = db23.value.distance; // side opposite P1
  const b = db31.value.distance; // side opposite P2
  const c = db12.value.distance; // side opposite P3

  if (a === 0 || b === 0 || c === 0) {
    return err("Two control points are coincident.");
  }

  const cosP1 = (b ** 2 + c ** 2 - a ** 2) / (2 * b * c);
  const cosP2 = (a ** 2 + c ** 2 - b ** 2) / (2 * a * c);
  const cosP3 = (a ** 2 + b ** 2 - c ** 2) / (2 * a * b);

  if (Math.abs(cosP1) > 1 || Math.abs(cosP2) > 1 || Math.abs(cosP3) > 1) {
    return err("Degenerate triangle — control points may be collinear.");
  }

  const P1angle = Math.acos(cosP1);
  const P2angle = Math.acos(cosP2);
  const P3angle = Math.acos(cosP3);

  // Tienstra weighting factors
  const K1 = 1 / (1 / Math.tan(P1angle) - cotA);
  const K2 = 1 / (1 / Math.tan(P2angle) - cotB);
  const K3 = 1 / (1 / Math.tan(P3angle) - (cotA + cotB));  // note: cot(360-A-B)

  const Ksum = K1 + K2 + K3;

  if (Math.abs(Ksum) < 1e-10) {
    return err("Tienstra solution is indeterminate — instrument is on the danger circle.");
  }

  const easting =
    (K1 * p1.easting + K2 * p2.easting + K3 * p3.easting) / Ksum;
  const northing =
    (K1 * p1.northing + K2 * p2.northing + K3 * p3.northing) / Ksum;

  return ok({
    instrumentStation: { easting, northing },
    residuals: [0, 0, 0], // full residual analysis requires redundant observations
  });
}

/**
 * DISTANCE-DISTANCE INTERSECTION
 * Given two known points and distances to an unknown point,
 * returns both possible intersection points (the two circles intersect in 2 places).
 * Caller must choose the correct solution based on field knowledge.
 */
export function distanceIntersection(
  stationA: Point2D,
  distA: number,
  stationB: Point2D,
  distB: number
): SurveyResult<{ solution1: Point2D; solution2: Point2D }> {
  const d = distanceBearing(stationA, stationB);
  if (!d.ok) return d;

  const dist = d.value.distance;

  if (dist > distA + distB) {
    return err("Points are too far apart — circles do not intersect.");
  }
  if (dist < Math.abs(distA - distB)) {
    return err("One circle is inside the other — no intersection.");
  }
  if (dist === 0) {
    return err("Stations A and B are coincident.");
  }

  // Distance from A to the radical axis
  const a = (distA ** 2 - distB ** 2 + dist ** 2) / (2 * dist);
  const h = Math.sqrt(distA ** 2 - a ** 2);

  // Midpoint
  const mx = stationA.easting + (a / dist) * d.value.deltaEasting;
  const my = stationA.northing + (a / dist) * d.value.deltaNorthing;

  // Perpendicular offset
  const px = (h / dist) * d.value.deltaNorthing;
  const py = (h / dist) * d.value.deltaEasting;

  return ok({
    solution1: { easting: mx + px, northing: my - py },
    solution2: { easting: mx - px, northing: my + py },
  });
}
