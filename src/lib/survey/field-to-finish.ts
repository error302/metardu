// Planar traverse computation from explicitly reduced grid bearings/distances.
// Results are numerical drafts; field and professional acceptance are separate.

import { bowditchAdjustment, transitAdjustment, type TraverseInput, type SurveyTypeKey, evaluateTraverseClosure } from '@/lib/engine/traverse';
import { hasCrossingBoundary } from './boundaryValidity';
import { toRadians } from '@/lib/engine/angles';
import { coordinateArea } from '@/lib/engine/area';

// ─── Types ───────────────────────────────────────────────────────────────

export interface FieldObservation {
  fromStation: string;
  toStation: string;
  /** Face Left horizontal angle (decimal degrees or DMS components) */
  hclDeg?: number; hclMin?: number; hclSec?: number;
  /** Face Right horizontal angle */
  hcrDeg?: number; hcrMin?: number; hcrSec?: number;
  /** Mean bearing (if pre-computed) */
  bearing?: number;
  /** Slope distance in metres */
  slopeDistance: number;
  /** Explicitly reduced grid observations must not receive EDM corrections twice. */
  distanceType?: 'grid' | 'slope';
  /** Vertical angle (decimal degrees) */
  verticalAngle?: number;
  /** Instrument height */
  ih?: number;
  /** Target height */
  th?: number;
  /** Atmospheric conditions (optional — auto-fetched if missing) */
  temperature?: number; // °C
  pressure?: number;    // hPa
  humidity?: number;    // %
}

export interface FieldToFinishInput {
  observations: FieldObservation[];
  startStation: { name: string; easting: number; northing: number };
  /** For link traverses — the known closing point */
  closeStation?: { name: string; easting: number; northing: number };
  /** Traverse mode */
  mode: 'open' | 'closed' | 'link';
  /** Survey type for precision standards */
  surveyType: SurveyTypeKey;
  /** Adjustment method */
  adjustmentMethod?: 'bowditch' | 'transit';
  /** LR number for deed plan */
  lrNumber?: string;
  /** Surveyor info */
  surveyorName?: string;
  surveyorLicense?: string;
  /** Declared UTM zone metadata; this planar calculation applies no projection reduction. */
  utmZone?: number;
}

export interface ClosureFeedback {
  /** Available instantly — before full pipeline runs */
  closingErrorE: number;
  closingErrorN: number;
  linearMisclosure: number;
  perimeter: number;
  precisionRatio: number;
  precisionFormatted: string;
  passes: boolean;
  standard: string;
  grade: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unacceptable';
  message: string;
}

export interface FieldToFinishResult {
  status: 'ready' | 'warning' | 'failed';
  /** Instant closure feedback (computed first, available immediately) */
  instantFeedback: ClosureFeedback;
  /** Adjusted coordinates */
  adjustedPoints: Array<{
    name: string;
    easting: number;
    northing: number;
    /** Unadjusted planar coordinates derived from the retained leg readings. */
    originalEasting?: number;
    originalNorthing?: number;
    elevation?: number;
  }>;
  /** Instrument corrections, absent for already reduced grid distances. */
  corrections: Array<{
    from: string;
    to: string;
    rawSlopeDistance: number;
    correctedDistance: number;
    horizontalDistance: number;
    gridDistance: number;
    atmosphericPPM: number;
    curvatureRefractionMM: number;
    scaleFactor: number;
  }>;
  /** Area computation */
  area: {
    squareMetres: number;
    hectares: number;
    acres: number;
  };
  /** Closure check on adjusted coordinates */
  closureCheck: {
    closingErrorE: number;
    closingErrorN: number;
    perimeter: number;
    precisionRatio: string;
    passes: boolean;
  };
  /** Draft boundary geometry; not accepted field evidence. */
  deedPlanData: {
    boundaryPoints: Array<{ id: string; easting: number; northing: number }>;
    boundaryLegs: Array<{ from: string; to: string; bearing: string; distance: number }>;
    area: number;
  } | null;
  /** Validation errors (if status === 'failed') */
  errors: string[];
  /** Validation warnings (if status === 'warning') */
  warnings: string[];
  /** Processing time in ms */
  processingTimeMs: number;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────

export async function fieldToFinish(input: FieldToFinishInput): Promise<FieldToFinishResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Step 0: Validate input ──
  if (input.observations.length < 2) {
    return failResult('At least 2 observations required', startTime);
  }
  if (!input.startStation || !input.startStation.name.trim() || !Number.isFinite(input.startStation.easting) || !Number.isFinite(input.startStation.northing)) {
    return failResult('Start station is required', startTime);
  }
  if (input.observations.some(observation => !Number.isFinite(observation.slopeDistance) || observation.slopeDistance <= 0 || (observation.bearing !== undefined && (!Number.isFinite(observation.bearing) || observation.bearing < 0 || observation.bearing >= 360)))) {
    return failResult('Every leg needs a positive finite distance and a valid bearing.', startTime);
  }

  // Horizontal circle readings need orientation evidence; slope observations
  // need an explicit reduction model. Neither may become a default bearing/grid.
  if (input.observations.some(obs => obs.bearing === undefined || obs.distanceType !== 'grid')) {
    return failResult('Supply oriented grid bearings and explicitly reduced grid distances. Use the reduction workflow for instrument observations.', startTime);
  }
  const processedObs = input.observations;
  const corrections: FieldToFinishResult['corrections'] = [];
  const correctedBearings = processedObs.map(obs => Number(obs.bearing));
  const correctedDistances = processedObs.map(obs => obs.slopeDistance);

  // ── Step 3: Build traverse input ──
  const points = [{ ...input.startStation }];
  for (let i = 0; i < processedObs.length; i++) {
    points.push({
      name: processedObs[i].toStation,
      easting: 0, // Will be computed
      northing: 0,
    });
  }

  const traverseInput: TraverseInput = {
    points,
    distances: correctedDistances,
    bearings: correctedBearings,
    closingPoint: input.closeStation,
  };

  // ── Step 4: Run traverse adjustment ──
  const adjustmentMethod = input.adjustmentMethod || 'bowditch';
  const adjusted = adjustmentMethod === 'bowditch'
    ? bowditchAdjustment(traverseInput)
    : transitAdjustment(traverseInput);

  // ── Step 5: Instant closure feedback ──
  const closureEval = evaluateTraverseClosure(
    adjusted.linearError,
    adjusted.totalDistance,
    input.surveyType,
  );

  const instantFeedback: ClosureFeedback = {
    closingErrorE: adjusted.closingErrorE,
    closingErrorN: adjusted.closingErrorN,
    linearMisclosure: adjusted.linearError,
    perimeter: adjusted.totalDistance,
    precisionRatio: closureEval.ratio,
    precisionFormatted: `1 : ${closureEval.ratio.toLocaleString()}`,
    passes: closureEval.passes,
    standard: `1:${closureEval.minimum.toLocaleString()} (${input.surveyType})`,
    grade: getGrade(closureEval.ratio),
    message: closureEval.passes
      ? `✓ Traverse closes at 1:${closureEval.ratio.toLocaleString()} — meets the ${input.surveyType} numerical engine preset (1:${closureEval.minimum.toLocaleString()})`
      : `✗ Traverse DOES NOT close at 1:${closureEval.ratio.toLocaleString()} — the ${input.surveyType} numerical engine preset is 1:${closureEval.minimum.toLocaleString()}. Check field observations.`,
  };

  // ── Step 6: Build adjusted points ──
  let originalEasting = input.startStation.easting;
  let originalNorthing = input.startStation.northing;
  const adjustedPoints = adjusted.legs.map((leg) => {
    originalEasting += leg.rawDeltaE;
    originalNorthing += leg.rawDeltaN;
    return { name: leg.to, easting: leg.adjEasting, northing: leg.adjNorthing, originalEasting, originalNorthing };
  });
  // Add start point
  adjustedPoints.unshift({
    name: input.startStation.name,
    easting: input.startStation.easting,
    northing: input.startStation.northing,
    originalEasting: input.startStation.easting,
    originalNorthing: input.startStation.northing,
  });

  // ── Step 7: Compute area ──
  const polygonPoints = input.mode === 'closed' ? adjustedPoints.slice(0,-1) : adjustedPoints;
  const boundaryPoints = polygonPoints.map((p, i) => ({
    id: p.name || `P${i}`,
    easting: p.easting,
    northing: p.northing,
  }));

  let areaResult = { squareMetres: 0, hectares: 0, acres: 0 };
  let closureCheckResult = {
    closingErrorE: 0, closingErrorN: 0, perimeter: 0,
    precisionRatio: 'N/A', passes: false,
  };
  let deedPlanData: FieldToFinishResult['deedPlanData'] = null;

  if (input.mode !== 'open' && boundaryPoints.length >= 3) {
    const areaM2 = coordinateArea(boundaryPoints).areaSqm;
    areaResult = {
      squareMetres: areaM2,
      hectares: Math.round(areaM2 / 10000 * 10000) / 10000,
      acres: Math.round(areaM2 / 4046.8564224 * 10000) / 10000,
    };

    // Report pre-adjustment closure, not the zero residual of a forced polygon.
    closureCheckResult = {
      closingErrorE: adjusted.closingErrorE, closingErrorN: adjusted.closingErrorN,
      perimeter: adjusted.totalDistance, precisionRatio: instantFeedback.precisionFormatted,
      passes: closureEval.passes,
    };

    // Build deed plan data
    const closedPoints = [...boundaryPoints, boundaryPoints[0]];
    const legs = [];
    for (let i = 0; i < closedPoints.length - 1; i++) {
      const from = closedPoints[i];
      const to = closedPoints[i + 1];
      const deltaE = to.easting - from.easting;
      const deltaN = to.northing - from.northing;
      const bearing = ((Math.atan2(deltaE, deltaN) * 180 / Math.PI) + 360) % 360;
      const distance = Math.sqrt(deltaE * deltaE + deltaN * deltaN);

      legs.push({
        from: from.id,
        to: to.id,
        bearing: decimalToDMS(bearing),
        distance: Math.round(distance * 1000) / 1000,
      });
    }

    deedPlanData = {
      boundaryPoints: boundaryPoints.map((p) => ({ id: p.id, easting: p.easting, northing: p.northing })),
      boundaryLegs: legs,
      area: areaM2,
    };
  }

  // ── Step 8: Determine final status ──
  let status: FieldToFinishResult['status'] = 'ready';

  if (input.mode !== 'open' && (!Number.isFinite(areaResult.squareMetres) || areaResult.squareMetres <= 0 || hasCrossingBoundary(polygonPoints))) {
    status = 'failed';
    errors.push('Invalid parcel boundary: crossing edges or zero area. Check station order and observations.');
  }

  if (!closureEval.passes && input.mode !== 'open') {
    status = 'failed';
    errors.push(instantFeedback.message);
  }

  if (input.mode === 'open') {
    warnings.push('Open traverse — no closure check possible. Use closed or link mode for cadastral surveys.');
  }

  if (areaResult.hectares > 0 && areaResult.hectares < 0.01) {
    warnings.push('Very small parcel — verify area computation.');
  }

  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    status,
    instantFeedback,
    adjustedPoints,
    corrections,
    area: areaResult,
    closureCheck: closureCheckResult,
    deedPlanData,
    errors,
    warnings,
    processingTimeMs,
  };
}

// ─── Instant Closure Check (no corrections, no adjustment — just closure) ──

/**
 * Compute traverse closure INSTANTLY from raw observations.
 * This is what the surveyor sees as they type — before running the full pipeline.
 * Use this for real-time feedback in the field book.
 */
export function instantClosureCheck(
  observations: Array<{ bearing: number; slopeDistance: number }>,
  startStation: { easting: number; northing: number },
  closeStation?: { easting: number; northing: number },
): ClosureFeedback {
  let sumE = 0;
  let sumN = 0;
  let perimeter = 0;

  for (const obs of observations) {
    const rad = toRadians(obs.bearing);
    sumN += obs.slopeDistance * Math.cos(rad);
    sumE += obs.slopeDistance * Math.sin(rad);
    perimeter += obs.slopeDistance;
  }

  const computedE = startStation.easting + sumE;
  const computedN = startStation.northing + sumN;

  const targetE = closeStation?.easting ?? startStation.easting;
  const targetN = closeStation?.northing ?? startStation.northing;

  const closingErrorE = targetE - computedE;
  const closingErrorN = targetN - computedN;
  const linearMisclosure = Math.sqrt(closingErrorE ** 2 + closingErrorN ** 2);
  const precisionRatio = perimeter > 0 && linearMisclosure > 0
    ? Math.round(perimeter / linearMisclosure)
    : Infinity;

  const grade = getGrade(precisionRatio);
  const passes = precisionRatio >= 5000; // Kenya cadastral minimum

  return {
    closingErrorE,
    closingErrorN,
    linearMisclosure,
    perimeter,
    precisionRatio,
    precisionFormatted: precisionRatio === Infinity ? '∞ (perfect)' : `1 : ${precisionRatio.toLocaleString()}`,
    passes,
    standard: '1:5,000 (cadastral minimum)',
    grade,
    message: passes
      ? `✓ 1:${precisionRatio.toLocaleString()} — passes cadastral standard`
      : `✗ 1:${precisionRatio.toLocaleString()} — FAILS cadastral minimum (1:5,000). ${linearMisclosure.toFixed(3)}m misclosure over ${perimeter.toFixed(1)}m`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getGrade(ratio: number): ClosureFeedback['grade'] {
  if (ratio >= 10000) return 'excellent';
  if (ratio >= 5000) return 'good';
  if (ratio >= 3000) return 'acceptable';
  if (ratio >= 1000) return 'poor';
  return 'unacceptable';
}

function decimalToDMS(decimal: number): string {
  const d = Math.floor(decimal);
  const m = Math.floor((decimal - d) * 60);
  const s = ((decimal - d) * 60 - m) * 60;
  return `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"`;
}

function failResult(message: string, startTime: number): FieldToFinishResult {
  return {
    status: 'failed',
    instantFeedback: {
      closingErrorE: 0, closingErrorN: 0, linearMisclosure: 0, perimeter: 0,
      precisionRatio: 0, precisionFormatted: 'N/A', passes: false,
      standard: '', grade: 'unacceptable', message,
    },
    adjustedPoints: [],
    corrections: [],
    area: { squareMetres: 0, hectares: 0, acres: 0 },
    closureCheck: { closingErrorE: 0, closingErrorN: 0, perimeter: 0, precisionRatio: 'N/A', passes: false },
    deedPlanData: null,
    errors: [message],
    warnings: [],
    processingTimeMs: Math.round(performance.now() - startTime),
  };
}
