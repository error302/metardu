/**
 * engineering.ts
 * Shared computation engine for all Metardu engineering survey sub-types.
 * Road, Bridge, Dam, Pipeline, Railway, Building, Tunnel.
 * All coordinates in SRID 21037 (Arc 1960 / UTM Zone 37S).
 */

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

export interface VerticalCurve {
  pvIChainage: number;
  pvIElevation: number;
  length: number;
  gradeIn: number;
  gradeOut: number;
  highLowPoint?: { chainage: number; elevation: number };
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
): HorizontalCurve {
  const deltaRad = (delta * Math.PI) / 180;
  const tangentLength = radius * Math.tan(deltaRad / 2);
  const curveLength = radius * deltaRad;
  const externalDistance = radius * (1 / Math.cos(deltaRad / 2) - 1);
  const midOrdinate = radius * (1 - Math.cos(deltaRad / 2));
  const longChord = 2 * radius * Math.sin(deltaRad / 2);
  const pcChainage = piChainage - tangentLength;
  const ptChainage = pcChainage + curveLength;

  return {
    piChainage,
    radius,
    delta,
    tangentLength,
    curveLength,
    externalDistance,
    midOrdinate,
    longChord,
    pcChainage,
    ptChainage,
  };
}

export function computeVerticalCurve(
  pvIChainage: number,
  pvIElevation: number,
  gradeIn: number,
  gradeOut: number,
  length: number
): VerticalCurve {
  const r = (gradeOut - gradeIn) / length;

  const pvcChainage = pvIChainage - length / 2;
  const pvcElevation = pvIElevation - (gradeIn * length / 200);

  let highLowPoint: { chainage: number; elevation: number } | undefined;
  const distToHL = -gradeIn / r;

  if (distToHL > 0 && distToHL < length) {
    const hlChainage = pvcChainage + distToHL;
    const hlElevation = pvcElevation + (gradeIn * distToHL / 100) + (r * distToHL * distToHL / 2);
    highLowPoint = { chainage: hlChainage, elevation: hlElevation };
  }

  return { pvIChainage, pvIElevation, length, gradeIn, gradeOut, highLowPoint };
}

export function verticalCurveElevation(
  vc: VerticalCurve,
  chainage: number
): number {
  const pvcChainage = vc.pvIChainage - vc.length / 2;
  const pvcElevation = vc.pvIElevation - (vc.gradeIn * vc.length / 200);
  const x = chainage - pvcChainage;

  if (x < 0 || x > vc.length) {
    return x < 0
      ? pvcElevation + (vc.gradeIn * x / 100)
      : pvcElevation + (vc.gradeIn * vc.length / 100) + (vc.gradeOut * (x - vc.length) / 100);
  }

  const r = (vc.gradeOut - vc.gradeIn) / vc.length;
  return pvcElevation + (vc.gradeIn * x / 100) + (r * x * x / 2);
}

export function crossSectionCutFill(
  designElevation: number,
  naturalLevels: Array<{ offset: number; elevation: number }>,
  sideSlopeH: number = 1.5
): { cutArea: number; fillArea: number } {
  let cutArea = 0;
  let fillArea = 0;

  naturalLevels.forEach(point => {
    const diff = designElevation - point.elevation;
    if (diff > 0) {
      fillArea += Math.abs(diff) * sideSlopeH;
    } else {
      cutArea += Math.abs(diff) * sideSlopeH;
    }
  });

  return { cutArea, fillArea };
}

export function prismoidalVolume(
  area1: number,
  area2: number,
  distance: number
): number {
  return ((area1 + area2) / 2) * distance;
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