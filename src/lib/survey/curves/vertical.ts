/**
 * Vertical Curve Calculations
 * 
 * Parabolic vertical curve design for road and railway alignments.
 * 
 * References:
 * - Schofield, W. (2001) "Engineering Surveying"
 * - AASHTO Green Book
 */

// ─── Types ───────────────────────────────────────────────────────

export interface VerticalCurveInput {
  /** Grade of approaching tangent (%). Positive = uphill. e.g., +2.5 */
  g1: number;
  /** Grade of departing tangent (%) */
  g2: number;
  /** Length of vertical curve (meters). Must be positive. */
  length: number;
  /** Elevation at PVC (Point of Vertical Curvature) in meters */
  pvcElevation: number;
  /** Chainage/station of PVC in meters */
  pvcChainage: number;
}

export interface VerticalCurveResult {
  g1: number;
  g2: number;
  length: number;
  pvcElevation: number;
  pvcChainage: number;
  pvtElevation: number;
  pvtChainage: number;
  /** Algebraic difference in grades (A = g2 - g1) */
  A: number;
  /** Rate of change of grade (K = L / |A|) */
  K: number;
  /** Elevation at the interior turning point, when one exists */
  turningPointElevation?: number;
  /** Chainage at the interior turning point, when one exists */
  turningPointChainage?: number;
  /** Distance from PVC to turning point */
  turningPointDistance?: number;
  /** Crest (A < 0), sag (A > 0), or flat (A = 0). */
  curveType: 'crest' | 'sag' | 'flat';
}

export interface VerticalCurveStationResult {
  chainage: number;
  distanceFromPVC: number;
  elevation: number;
  grade: number;
  tangentOffset: number;
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Compute vertical curve parameters.
 * 
 * The parabolic vertical curve formula for grades entered in percent:
 *   y = y_PVC + (g1 / 100) × x + (A / (200L)) × x²
 * 
 * Where:
 *   x = distance from PVC
 *   A = g2 - g1 (algebraic difference in grades)
 *   L = curve length
 */
export function computeVerticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const { g1, g2, length, pvcElevation, pvcChainage } = input;
  if (![g1, g2, length, pvcElevation, pvcChainage].every(Number.isFinite) || length <= 0) {
    throw new Error('Vertical curve needs finite grades, chainage, elevation, and a positive length.')
  }
  
  const A = g2 - g1;
  const K = length / Math.abs(A);
  
  // PVT elevation and chainage
  const pvtElevation = pvcElevation + ((g1 + g2) / 200) * length;
  const pvtChainage = pvcChainage + length;
  
  // Turning point (high point for crest, low point for sag)
  // dy/dx = g1 + (A/L) × x = 0 → x = -g1 × L / A
  let turningPointDistance: number | undefined;
  let turningPointElevation: number | undefined;
  let turningPointChainage: number | undefined;
  
  if (Math.abs(A) >= 1e-10) {
    const candidateDistance = (-g1 * length) / A;
    if (candidateDistance >= 0 && candidateDistance <= length) {
      turningPointDistance = candidateDistance;
    turningPointElevation = pvcElevation + 
        (g1 / 100) * candidateDistance +
        (A / (200 * length)) * candidateDistance * candidateDistance;
      turningPointChainage = pvcChainage + candidateDistance;
    }
  }
  
  const curveType = Math.abs(A) < 1e-10 ? 'flat' : A < 0 ? 'crest' : 'sag';
  
  return {
    g1,
    g2,
    length,
    pvcElevation,
    pvcChainage,
    pvtElevation,
    pvtChainage,
    A,
    K,
    turningPointElevation,
    turningPointChainage,
    turningPointDistance,
    curveType,
  };
}

/**
 * Compute elevations at regular intervals along a vertical curve.
 */
export function computeVerticalCurveStations(
  curve: VerticalCurveResult,
  interval: number = 10
): VerticalCurveStationResult[] {
  if (!Number.isFinite(interval) || interval <= 0) throw new Error('Station interval must be finite and greater than zero.')
  const stations: VerticalCurveStationResult[] = [];
  const { g1, g2, length, pvcElevation, pvcChainage } = curve;
  if (![g1, g2, length, pvcElevation, pvcChainage].every(Number.isFinite) || length <= 0) throw new RangeError('Station evaluation requires finite curve parameters and positive length.')
  const A = g2 - g1;
  
  const numStations = Math.floor(length / interval);
  if (numStations > 100_000) throw new Error('Station interval creates too many rows; increase the interval.')
  
  for (let i = 0; i <= numStations; i++) {
    const x = i * interval;
    const elevation = pvcElevation + 
      (g1 / 100) * x + 
      (A / (200 * length)) * x * x;
    const grade = g1 + (A / length) * x;
    const tangentElevation = pvcElevation + (g1 / 100) * x;
    const tangentOffset = elevation - tangentElevation;
    
    stations.push({
      chainage: pvcChainage + x,
      distanceFromPVC: x,
      elevation,
      grade,
      tangentOffset,
    });
  }
  
  // Add PVT station if not at interval
  const lastStation = stations[stations.length - 1];
  if (lastStation.distanceFromPVC !== length) {
    const elevation = pvcElevation + 
      (g1 / 100) * length + 
      (A / (200 * length)) * length * length;
    
    stations.push({
      chainage: curve.pvtChainage,
      distanceFromPVC: length,
      elevation,
      grade: curve.g2,
      tangentOffset: elevation - (pvcElevation + g1 / 100 * length),
    });
  }
  
  return stations;
}
