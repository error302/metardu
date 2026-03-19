import { NamedPoint2D, Point2D, SurveyResult, ok, err } from "./types";
import { distanceBearing } from "./distance";
import { bearingToString } from "./angles";

// ─── TRAVERSE ADJUSTMENT ──────────────────────────────────────────────────────

export interface TraverseLeg {
  fromName: string;
  toName: string;
  distance: number;
  rawBearing: number;       // computed from raw coordinates
  rawDeltaE: number;
  rawDeltaN: number;
  correctionE: number;      // Bowditch/Transit correction applied
  correctionN: number;
  adjustedDeltaE: number;
  adjustedDeltaN: number;
}

export interface TraverseResult {
  method: "bowditch" | "transit";
  totalDistance: number;
  closingErrorE: number;    // linear closing error, easting component
  closingErrorN: number;
  linearError: number;      // total misclosure in metres
  precisionRatio: number;   // 1 : N  (higher = better)
  adjustedPoints: NamedPoint2D[];
  legs: TraverseLeg[];
  /**
   * Acceptable precision thresholds (informational):
   *  Urban cadastral:  1 : 5 000
   *  Suburban:         1 : 3 000
   *  Rural:            1 : 1 000
   */
  precisionGrade: "excellent" | "good" | "acceptable" | "poor";
}

function precisionGrade(ratio: number): TraverseResult["precisionGrade"] {
  if (ratio >= 5000) return "excellent";
  if (ratio >= 3000) return "good";
  if (ratio >= 1000) return "acceptable";
  return "poor";
}

/**
 * Bowditch (Compass Rule) traverse adjustment.
 *
 * Correction per leg = (leg distance / total distance) × total closing error
 * Applied proportionally to each leg's ΔE and ΔN.
 *
 * The first point is treated as the fixed origin (known coordinates).
 * For a CLOSED traverse the last point should equal the first — the function
 * does NOT require this; it calculates the misclosure between the last computed
 * point and the first point.
 *
 * @param stations  Ordered list of traverse stations (raw observed/computed coords)
 */
export function bowditchAdjustment(
  stations: NamedPoint2D[]
): SurveyResult<TraverseResult> {
  if (stations.length < 3) {
    return err("A traverse requires at least 3 stations.");
  }

  // ── Step 1: compute raw legs ──────────────────────────────────────────────
  const rawLegs: Array<{
    fromName: string; toName: string;
    dist: number; dE: number; dN: number;
  }> = [];

  let totalDistance = 0;

  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const db = distanceBearing(a, b);
    if (!db.ok) return err(`Leg ${a.name}→${b.name}: ${db.error}`);

    const { distance, deltaEasting: dE, deltaNorthing: dN } = db.value;
    rawLegs.push({ fromName: a.name, toName: b.name, dist: distance, dE, dN });
    totalDistance += distance;
  }

  if (totalDistance === 0) return err("All stations are coincident.");

  // ── Step 2: compute misclosure ────────────────────────────────────────────
  // For a closed traverse, sum of all ΔE should equal 0 and sum of ΔN should equal 0
  // (if last point == first point). We measure vs. expected closing point.
  const sumDeltaE = rawLegs.reduce((s, l) => s + l.dE, 0);
  const sumDeltaN = rawLegs.reduce((s, l) => s + l.dN, 0);

  // Expected closing: last station back to first station
  const first = stations[0];
  const last = stations[stations.length - 1];
  const expectedDE = last.easting - first.easting;
  const expectedDN = last.northing - first.northing;

  const closingErrorE = sumDeltaE - expectedDE;
  const closingErrorN = sumDeltaN - expectedDN;
  const linearError = Math.sqrt(closingErrorE ** 2 + closingErrorN ** 2);
  const precisionRatio = linearError === 0 ? Infinity : totalDistance / linearError;

  // ── Step 3: apply Bowditch corrections ────────────────────────────────────
  const adjustedLegs: TraverseLeg[] = rawLegs.map((leg) => {
    const corrE = -(leg.dist / totalDistance) * closingErrorE;
    const corrN = -(leg.dist / totalDistance) * closingErrorN;

    const db = distanceBearing(
      { easting: 0, northing: 0 },
      { easting: leg.dE, northing: leg.dN }
    );
    const rawBearing = db.ok ? db.value.forwardBearing : 0;

    return {
      fromName: leg.fromName,
      toName: leg.toName,
      distance: leg.dist,
      rawBearing,
      rawDeltaE: leg.dE,
      rawDeltaN: leg.dN,
      correctionE: corrE,
      correctionN: corrN,
      adjustedDeltaE: leg.dE + corrE,
      adjustedDeltaN: leg.dN + corrN,
    };
  });

  // ── Step 4: propagate adjusted coordinates ────────────────────────────────
  const adjustedPoints: NamedPoint2D[] = [
    { name: stations[0].name, easting: stations[0].easting, northing: stations[0].northing },
  ];

  for (let i = 0; i < adjustedLegs.length; i++) {
    const prev = adjustedPoints[i];
    const leg = adjustedLegs[i];
    adjustedPoints.push({
      name: stations[i + 1].name,
      easting: prev.easting + leg.adjustedDeltaE,
      northing: prev.northing + leg.adjustedDeltaN,
    });
  }

  return ok({
    method: "bowditch",
    totalDistance,
    closingErrorE,
    closingErrorN,
    linearError,
    precisionRatio,
    adjustedPoints,
    legs: adjustedLegs,
    precisionGrade: precisionGrade(precisionRatio),
  });
}

/**
 * Transit Rule traverse adjustment.
 *
 * Correction per leg:
 *   corrE = -(|ΔE_leg| / Σ|ΔE|) × closingErrorE
 *   corrN = -(|ΔN_leg| / Σ|ΔN|) × closingErrorN
 *
 * Preferred over Bowditch when angular accuracy > linear accuracy.
 */
export function transitAdjustment(
  stations: NamedPoint2D[]
): SurveyResult<TraverseResult> {
  if (stations.length < 3) {
    return err("A traverse requires at least 3 stations.");
  }

  const rawLegs: Array<{
    fromName: string; toName: string;
    dist: number; dE: number; dN: number;
  }> = [];

  let totalDistance = 0;

  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const db = distanceBearing(a, b);
    if (!db.ok) return err(`Leg ${a.name}→${b.name}: ${db.error}`);
    const { distance, deltaEasting: dE, deltaNorthing: dN } = db.value;
    rawLegs.push({ fromName: a.name, toName: b.name, dist: distance, dE, dN });
    totalDistance += distance;
  }

  const sumAbsDE = rawLegs.reduce((s, l) => s + Math.abs(l.dE), 0);
  const sumAbsDN = rawLegs.reduce((s, l) => s + Math.abs(l.dN), 0);

  const first = stations[0], last = stations[stations.length - 1];
  const closingErrorE = rawLegs.reduce((s, l) => s + l.dE, 0) - (last.easting - first.easting);
  const closingErrorN = rawLegs.reduce((s, l) => s + l.dN, 0) - (last.northing - first.northing);
  const linearError = Math.sqrt(closingErrorE ** 2 + closingErrorN ** 2);
  const precisionRatio = linearError === 0 ? Infinity : totalDistance / linearError;

  const adjustedLegs: TraverseLeg[] = rawLegs.map((leg) => {
    const corrE = sumAbsDE === 0 ? 0 : -(Math.abs(leg.dE) / sumAbsDE) * closingErrorE;
    const corrN = sumAbsDN === 0 ? 0 : -(Math.abs(leg.dN) / sumAbsDN) * closingErrorN;
    const db = distanceBearing({ easting: 0, northing: 0 }, { easting: leg.dE, northing: leg.dN });
    return {
      fromName: leg.fromName,
      toName: leg.toName,
      distance: leg.dist,
      rawBearing: db.ok ? db.value.forwardBearing : 0,
      rawDeltaE: leg.dE,
      rawDeltaN: leg.dN,
      correctionE: corrE,
      correctionN: corrN,
      adjustedDeltaE: leg.dE + corrE,
      adjustedDeltaN: leg.dN + corrN,
    };
  });

  const adjustedPoints: NamedPoint2D[] = [
    { name: stations[0].name, easting: stations[0].easting, northing: stations[0].northing },
  ];
  for (let i = 0; i < adjustedLegs.length; i++) {
    const prev = adjustedPoints[i];
    adjustedPoints.push({
      name: stations[i + 1].name,
      easting: prev.easting + adjustedLegs[i].adjustedDeltaE,
      northing: prev.northing + adjustedLegs[i].adjustedDeltaN,
    });
  }

  return ok({
    method: "transit",
    totalDistance,
    closingErrorE,
    closingErrorN,
    linearError,
    precisionRatio,
    adjustedPoints,
    legs: adjustedLegs,
    precisionGrade: precisionGrade(precisionRatio),
  });
}
