/**
 * engineering.ts
 * Shared computation engine for all Metardu engineering survey sub-types.
 * Road, Bridge, Dam, Pipeline, Railway, Building, Tunnel.
 * Coordinate and vertical references must come from the project; this module
 * does not establish a blanket SRID, datum or adopted design standard.
 */

import { verticalCurveGeometry, horizontalCurveElements, horizontalCurveInputFromDecimal } from '../computations/roadDesignEngine';

export const ENGINEERING_SUBTYPES = [
  'road',
  'bridge',
  'dam',
  'pipeline',
  'railway',
  'building',
  'tunnel',
] as const;

export type EngineeringSubtype = typeof ENGINEERING_SUBTYPES[number];

export const ENGINEERING_SUBTYPE_LABELS: Record<EngineeringSubtype, string> = {
  road:     'Road Survey',
  bridge:   'Bridge Survey',
  dam:      'Dam / Reservoir Survey',
  pipeline: 'Pipeline Survey',
  railway:  'Railway Survey',
  building: 'Building Survey',
  tunnel:   'Tunnel Survey',
};

export interface AlignmentPoint {
  chainage: number;
  easting: number;
  northing: number;
  elevation?: number;
  label?: string;
}

export interface HorizontalCurve {
  piChainage: number;
  radius: number;
  delta: number;
  tangentLength: number;
  curveLength: number;
  externalDistance: number;
  midOrdinate: number;
  longChord: number;
  pcChainage: number;
  ptChainage: number;
}

export interface ComputedHorizontalCurve extends HorizontalCurve {
  standardCompliance: 'NOT_ASSESSED';
  coordinateReferenceStatus: 'NOT_VERIFIED';
}

export interface VerticalCurve {
  pvIChainage: number;
  pvIElevation: number;
  length: number;
  gradeIn: number;
  gradeOut: number;
  highLowPoint?: { chainage: number; elevation: number };
}

export interface ComputedVerticalCurve extends VerticalCurve {
  pvcChainage: number;
  pvcElevation: number;
  pvtChainage: number;
  pvtElevation: number;
  kValue: number | null;
  curveType: 'crest' | 'sag' | 'straight';
  standardCompliance: 'NOT_ASSESSED';
  verticalDatumStatus: 'NOT_VERIFIED';
}

function scalarVerticalModel(vc: VerticalCurve) {
  return verticalCurveGeometry({ g1: vc.gradeIn, g2: vc.gradeOut, vpiChainage: vc.pvIChainage,
    vpiRL: vc.pvIElevation, curveLength: vc.length });
}

export interface CrossSection {
  chainage: number;
  naturalLevels: Array<{ offset: number; elevation: number }>;
  designLevel: number;
  cutFillArea?: number;
}

export function computeHorizontalCurve(
  radius: number,
  delta: number,
  piChainage: number
): ComputedHorizontalCurve {
  const result = horizontalCurveElements(horizontalCurveInputFromDecimal(radius, delta, piChainage));
  return {
    piChainage, radius, delta, tangentLength: result.tangentLength, curveLength: result.curveLength,
    externalDistance: result.externalDistance, midOrdinate: result.midOrdinate, longChord: result.longChord,
    pcChainage: result.tcChainage, ptChainage: result.ctChainage,
    standardCompliance: 'NOT_ASSESSED', coordinateReferenceStatus: 'NOT_VERIFIED',
  };
}

export function computeVerticalCurve(
  pvIChainage: number,
  pvIElevation: number,
  gradeIn: number,
  gradeOut: number,
  length: number
): ComputedVerticalCurve {
  if (![pvIChainage, pvIElevation, gradeIn, gradeOut, length].every(Number.isFinite) || length <= 0) {
    throw new Error('Vertical curve requires finite PVI values, grades, and a positive curve length.')
  }
  const input = { pvIChainage, pvIElevation, length, gradeIn, gradeOut };
  const model = scalarVerticalModel(input);
  const highLowPoint = model.xPeak !== null && model.xPeak > 0 && model.xPeak < length &&
    model.chainagePeak !== null && model.rlPeak !== null ? { chainage: model.chainagePeak, elevation: model.rlPeak } : undefined;
  return { ...input, highLowPoint, pvcChainage: model.bvcChainage, pvcElevation: model.bvcRL,
    pvtChainage: model.evcChainage, pvtElevation: model.evcRL, kValue: model.K, curveType: model.curveType,
    standardCompliance: 'NOT_ASSESSED', verticalDatumStatus: 'NOT_VERIFIED' };
}

export function verticalCurveElevation(
  vc: VerticalCurve,
  chainage: number
): number {
  // This historical scalar API explicitly extends the incoming/outgoing
  // tangents. Project alignment coverage is checked separately by its caller.
  return scalarVerticalModel(vc).elevationAtStation(chainage, true);
}

/** Percent grade on the supplied parabola, with the outgoing/incoming tangent beyond its ends. */
export function verticalCurveGrade(vc: VerticalCurve, chainage: number): number {
  return scalarVerticalModel(vc).gradeAtStation(chainage, true);
}

/**
 * Compute cut/fill areas for a cross-section using trapezoidal integration.
 *
 * AUDIT FIX (2026-07-03): The old implementation was:
 *   `fillArea += Math.abs(diff) * sideSlopeH`  per point
 * which is dimensionally wrong (it multiplies a height by a ratio —
 * not an area) and produces meaningless results.
 *
 * The correct approach: the design (formation) is a horizontal line at
 * `designElevation`. The natural ground is a polyline through
 * `naturalLevels` (sorted by offset). We compute the area between these
 * two lines using the trapezoidal rule:
 *
 *   For each segment [i, i+1]:
 *     diff1 = designElevation - ground[i].elevation
 *     diff2 = designElevation - ground[i+1].elevation
 *     width = |ground[i+1].offset - ground[i].offset|
 *
 *     If both diffs > 0 (fill):  fillArea += (diff1 + diff2) / 2 * width
 *     If both diffs < 0 (cut):   cutArea  += (|diff1| + |diff2|) / 2 * width
 *     If different signs:        find the zero-crossing offset, split
 *                                into a cut triangle and a fill triangle
 *
 * The `sideSlopeH` parameter is no longer used in the calculation —
 * it was a misapplication. Side slopes are already accounted for in
 * the ground levels if the surveyor shot the full cross-section from
 * left slope stake to right slope stake. The parameter is kept in the
 * signature for backward compatibility but is ignored.
 */
export function crossSectionCutFill(
  designElevation: number,
  naturalLevels: Array<{ offset: number; elevation: number }>,
  _sideSlopeH: number = 1.5
): { cutArea: number; fillArea: number } {
  let cutArea = 0;
  let fillArea = 0;

  if (naturalLevels.length < 2) return { cutArea, fillArea };

  // Sort by offset to ensure left-to-right processing
  const sorted = [...naturalLevels].sort((a, b) => a.offset - b.offset);

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    const width = Math.abs(p2.offset - p1.offset);
    if (width < 1e-10) continue;

    const diff1 = designElevation - p1.elevation;  // + = fill, - = cut
    const diff2 = designElevation - p2.elevation;

    if (diff1 >= 0 && diff2 >= 0) {
      // Both fill
      fillArea += (diff1 + diff2) / 2 * width;
    } else if (diff1 <= 0 && diff2 <= 0) {
      // Both cut
      cutArea += (Math.abs(diff1) + Math.abs(diff2)) / 2 * width;
    } else {
      // Mixed — find the zero-crossing point
      // Linear interpolation: at what fraction t does diff = 0?
      // diff(t) = diff1 + t * (diff2 - diff1) = 0
      // t = -diff1 / (diff2 - diff1)
      const t = -diff1 / (diff2 - diff1);
      const crossingWidth = t * width;

      if (diff1 > 0) {
        // p1 is fill, p2 is cut → fill triangle then cut triangle
        fillArea += (diff1 * crossingWidth) / 2;
        cutArea += (Math.abs(diff2) * (width - crossingWidth)) / 2;
      } else {
        // p1 is cut, p2 is fill → cut triangle then fill triangle
        cutArea += (Math.abs(diff1) * crossingWidth) / 2;
        fillArea += (diff2 * (width - crossingWidth)) / 2;
      }
    }
  }

  return { cutArea, fillArea };
}

/**
 * Compute volume between two cross-sections using the average-end-area method.
 *
 * AUDIT FIX (2026-07-03): This function was named `prismoidalVolume` but
 * actually computed the end-area formula `V = (A1 + A2) / 2 * L`. The
 * prismoidal formula is `V = L/6 * (A1 + 4*Am + A2)` where Am is the
 * area at the midpoint — which requires a middle cross-section that
 * callers don't have.
 *
 * Renamed to `endAreaVolume` (honest naming). The old name `prismoidalVolume`
 * is kept as a deprecated alias for backward compatibility — it calls
 * `endAreaVolume` under the hood. Callers should migrate to `endAreaVolume`.
 *
 * For a true prismoidal volume, use `prismoidalVolumeFromMidSection`.
 */
export function endAreaVolume(
  area1: number,
  area2: number,
  distance: number
): number {
  return ((area1 + area2) / 2) * distance;
}

/**
 * True prismoidal volume: V = L/6 * (A1 + 4*Am + A2)
 * Requires the middle cross-section area (Am).
 */
export function prismoidalVolumeFromMidSection(
  area1: number,
  middleArea: number,
  area2: number,
  distance: number
): number {
  return (distance / 6) * (area1 + 4 * middleArea + area2);
}

/**
 * @deprecated Use `endAreaVolume` instead. This function computes the
 * end-area volume, not the prismoidal volume. Kept for backward compat.
 */
export function prismoidalVolume(
  area1: number,
  area2: number,
  distance: number
): number {
  return endAreaVolume(area1, area2, distance);
}

export function curveStakeoutPoint(
  pcEasting: number,
  pcNorthing: number,
  initialBearing: number,
  radius: number,
  chainage: number,
  direction: 'left' | 'right' = 'right'
): { easting: number; northing: number; bearing: number } {
  const angleRad = chainage / radius;
  const angleDeg = angleRad * 180 / Math.PI;
  const deflection = direction === 'right' ? angleDeg : -angleDeg;
  const chordBearing = ((initialBearing + deflection / 2) + 360) % 360;
  const chord = 2 * radius * Math.sin(angleRad / 2);
  const bearingRad = chordBearing * Math.PI / 180;

  return {
    easting: pcEasting + chord * Math.sin(bearingRad),
    northing: pcNorthing + chord * Math.cos(bearingRad),
    bearing: ((initialBearing + deflection) + 360) % 360,
  };
}

export interface EngineeringQAStandards {
  traversePrecision: number;
  levellingClosureMM: string;
  angularClosureSec: string;
  horizontalClosureMM: number;
}

export const ENGINEERING_QA: Record<EngineeringSubtype, EngineeringQAStandards> = {
  road:     { traversePrecision: 3000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 50 },
  bridge:   { traversePrecision: 5000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 20 },
  dam:      { traversePrecision: 5000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 20 },
  pipeline: { traversePrecision: 3000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 50 },
  railway:  { traversePrecision: 5000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 20 },
  building: { traversePrecision: 5000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 10 },
  tunnel:   { traversePrecision: 10000, levellingClosureMM: '10√K', angularClosureSec: '60√n', horizontalClosureMM: 5 },
};
