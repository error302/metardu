import { Point2D, Point3D, SurveyResult, ok, err } from "./types";
import { toRadians, toDegrees, normalizeBearing } from "./angles";

// ─── DISTANCE & BEARING ───────────────────────────────────────────────────────

export interface DistanceBearingResult {
  distance: number;         // horizontal distance, metres
  forwardBearing: number;   // A → B, decimal degrees
  backBearing: number;      // B → A, decimal degrees
  deltaEasting: number;     // B.easting  - A.easting
  deltaNorthing: number;    // B.northing - A.northing
}

export interface SlopeResult extends DistanceBearingResult {
  slopeDistance: number;    // metres, along slope
  verticalDifference: number;
  gradientPercent: number;
  gradientDegrees: number;
}

/**
 * Horizontal distance and whole-circle bearing between two 2D grid points.
 *
 * Bearing convention: 0° = North, clockwise positive (whole-circle bearing).
 *
 * @example
 *   distanceBearing({ easting: 1000, northing: 1000 },
 *                   { easting: 1100, northing: 1050 })
 *   // → { distance: 111.803, forwardBearing: 63.435, ... }
 */
export function distanceBearing(
  a: Point2D,
  b: Point2D
): SurveyResult<DistanceBearingResult> {
  const dE = b.easting - a.easting;
  const dN = b.northing - a.northing;

  if (dE === 0 && dN === 0) {
    return err("Points A and B are identical — bearing is undefined.");
  }

  const distance = Math.sqrt(dE * dE + dN * dN);

  // atan2 gives the angle from the Y-axis (North) clockwise — correct for surveying
  const forwardBearing = normalizeBearing(toDegrees(Math.atan2(dE, dN)));
  const backBearing = normalizeBearing(forwardBearing + 180);

  return ok({ distance, forwardBearing, backBearing, deltaEasting: dE, deltaNorthing: dN });
}

/**
 * Slope distance, vertical difference and gradient between two 3D points.
 * Also returns the full 2D distance/bearing result.
 */
export function slopeDistance(
  a: Point3D,
  b: Point3D
): SurveyResult<SlopeResult> {
  const horizontal = distanceBearing(a, b);
  if (!horizontal.ok) return horizontal;

  const dZ = b.elevation - a.elevation;
  const slope = Math.sqrt(
    horizontal.value.distance ** 2 + dZ ** 2
  );
  const gradientPercent =
    horizontal.value.distance === 0
      ? 0
      : (dZ / horizontal.value.distance) * 100;
  const gradientDegrees = toDegrees(Math.atan(dZ / horizontal.value.distance));

  return ok({
    ...horizontal.value,
    slopeDistance: slope,
    verticalDifference: dZ,
    gradientPercent,
    gradientDegrees,
  });
}

/**
 * Compute the 2D position of a point given a starting point,
 * bearing (whole-circle, decimal degrees), and horizontal distance.
 * This is the core of RADIATION / POLAR COMPUTATION.
 *
 * @example
 *   polarPoint({ easting: 1000, northing: 1000 }, 90, 50)
 *   // → { easting: 1050, northing: 1000 }
 */
export function polarPoint(
  from: Point2D,
  bearingDeg: number,
  distance: number
): SurveyResult<Point2D> {
  if (distance < 0) return err("Distance must be non-negative.");
  const rad = toRadians(bearingDeg);
  return ok({
    easting: from.easting + distance * Math.sin(rad),
    northing: from.northing + distance * Math.cos(rad),
  });
}
