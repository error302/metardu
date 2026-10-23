/**
 * Calculation standard: N.N. Basak — Surveying and Levelling
 * Source: N.N. Basak, Surveying and Levelling, Chapters 14-16
 * Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapters 24-25
 * Source: RDM 1.3 Kenya August 2023, Sections 5.2-5.4
 * - No intermediate rounding
 * - Full floating point precision throughout
 * - Round only at final display layer
 */

// METARDU Engine - Curve calculations

import { CurveElements, CurveStakeoutResult } from './types';
import { bearingToString } from './angles';
import { horizontalCurveElements, curveSetOut } from '../computations/roadDesignEngine';

export function curveElements(
  radius: number,
  deflectionAngle: number,
  _isExternal?: boolean
): CurveElements {
  const input = circularInput(radius, deflectionAngle, 0);
  const result = horizontalCurveElements(input);
  return { radius, deflectionAngle, tangentLength: result.tangentLength, arcLength: result.curveLength,
    longChord: result.longChord, externalDistance: result.externalDistance, midOrdinate: result.midOrdinate,
    degreeOfCurve: result.degreeOfCurve };
}

function circularInput(radius: number, angle: number, station: number) {
  if (!Number.isFinite(angle) || angle <= 0 || angle >= 180) throw new RangeError('Deflection must be finite, positive and less than 180 degrees.');
  const degrees = Math.floor(angle), decimalMinutes = (angle - degrees) * 60, minutes = Math.floor(decimalMinutes);
  return { radius, deflectionAngleDeg: degrees, deflectionAngleMin: minutes,
    deflectionAngleSec: (decimalMinutes - minutes) * 60, ipChainage: station };
}

export function curveStakeout(piChainage: number, bearingIn: number, radius: number, deflectionAngle: number, interval = 20): CurveStakeoutResult {
  if (!Number.isFinite(bearingIn)) throw new RangeError('Incoming bearing must be finite.');
  const input = circularInput(radius, deflectionAngle, piChainage);
  const result = horizontalCurveElements(input);
  const setout = curveSetOut({ ...input, tcChainage: result.tcChainage, ctChainage: result.ctChainage, interval });
  return { elements: curveElements(radius, deflectionAngle), pcChainage: result.tcChainage, piChainage, ptChainage: result.ctChainage,
    points: setout.rows.map(row => {
      const angle = (row.chainage - result.tcChainage) / radius;
      return { chainage: row.chainage, deflectionAngle: bearingToString(angle * 180 / Math.PI),
        totalDeflection: row.totalDeflection, chordLength: 2 * radius * Math.sin(angle / 2) };
    }) };
}

export function verticalCurve(
  incomingGrade: number,
  outgoingGrade: number,
  curveLength: number,
  startRL: number,
  interval: number = 10
): Array<{ chainage: number; rl: number; cutFill: number }> {
  // Parabolic vertical curve: y = (g2 - g1) * x^2 / (2L)
  // where x is distance from start of curve
  
  const gradeDiff = outgoingGrade - incomingGrade;
  const results: Array<{ chainage: number; rl: number; cutFill: number }> = [];
  
  const numPoints = Math.floor(curveLength / interval);
  
  for (let i = 0; i <= numPoints; i++) {
    const x = i * interval;
    const chainage = x;
    
    // Height of curve at this point
    const y = (gradeDiff * x * x) / (2 * curveLength);
    
    // RL at this point
    const rl = startRL + (incomingGrade * x / 100) + y;
    
    results.push({
      chainage,
      rl,
      cutFill: y
    });
  }
  
  // Find highest/lowest point
  if (gradeDiff !== 0) {
    const apexDistance = (incomingGrade * curveLength) / gradeDiff;
    if (apexDistance > 0 && apexDistance < curveLength) {
      // Add apex point
      const apexY = (gradeDiff * apexDistance * apexDistance) / (2 * curveLength);
      const apexRL = startRL + (incomingGrade * apexDistance / 100) + apexY;
      results.push({
        chainage: apexDistance,
        rl: apexRL,
        cutFill: apexY
      });
    }
  }
  
  return results.sort((a, b) => a.chainage - b.chainage);
}

export type CompoundCurveElements = {
  R1: number
  R2: number
  delta1Deg: number
  delta2Deg: number
  t1: number
  t2: number
  l1: number
  l2: number
  totalLength: number
  chainT1: number
  chainJ: number
  chainT2: number
}

/**
 * Compound curve elements (basic).
 * Uses standard simple-curve element formulas for each arc.
 */
export function compoundCurveElements(input: {
  R1: number
  R2: number
  delta1Deg: number
  delta2Deg: number
  junctionChainage: number
}): CompoundCurveElements {
  const first = curveElements(input.R1, input.delta1Deg);
  const second = curveElements(input.R2, input.delta2Deg);
  if (input.delta1Deg + input.delta2Deg >= 180) throw new RangeError('Compound total deflection must be less than 180 degrees.');
  const chainJ = input.junctionChainage;
  const chainT1 = chainJ - first.arcLength, chainT2 = chainJ + second.arcLength;
  const totalLength = first.arcLength + second.arcLength;
  const precision = 32 * Number.EPSILON * Math.max(1, Math.abs(chainJ), Math.abs(chainT1), Math.abs(chainT2));
  if (![chainT1, chainJ, chainT2, totalLength].every(Number.isFinite) || !(chainT1 < chainJ && chainJ < chainT2) ||
      precision > Math.min(first.arcLength, second.arcLength) * 1e-8) throw new RangeError('Compound chainages cannot resolve the supplied arc lengths.');
  return { ...input, t1: first.tangentLength, t2: second.tangentLength, l1: first.arcLength, l2: second.arcLength,
    totalLength, chainT1, chainJ, chainT2 };
}

export type ReverseCurveApprox = {
  R1: number; R2: number; AB: number;
  commonTangent: number; arcLength: number; totalLength: number;
  t1: number; t2: number; l1: number; l2: number;
  isApprox: boolean;
}

/** Historical name retained. Requires both deflections; no semicircle fallback.
 * AB is the PI1-to-PI2 distance along their shared tangent, not circle-centre
 * separation. The gap between arc endpoints is AB - T1 - T2. No world placement,
 * transitions, superelevation runout or standards approval are assessed.
 */
export function reverseCurveApprox(input: { R1: number; R2: number; AB: number; delta1?: number; delta2?: number }): ReverseCurveApprox {
  if (input.delta1 === undefined || input.delta2 === undefined) throw new RangeError('Both reverse-curve deflection angles are required.');
  if (!Number.isFinite(input.AB) || input.AB <= 0) throw new RangeError('PI distance along the common tangent must be finite and positive.');
  const first = curveElements(input.R1, input.delta1), second = curveElements(input.R2, input.delta2);
  const tangentSum = first.tangentLength + second.tangentLength;
  const commonTangent = input.AB - tangentSum;
  if (commonTangent < 0) throw new RangeError('Reverse arcs overlap: PI distance must be at least the sum of tangent lengths.');
  const arcLength = first.arcLength + second.arcLength, totalLength = arcLength + commonTangent;
  if (![tangentSum, commonTangent, arcLength, totalLength].every(Number.isFinite) || totalLength <= 0 ||
      (commonTangent > 0 && totalLength === arcLength) || totalLength === commonTangent) throw new RangeError('Reverse geometry exceeds available numerical precision.');
  return { R1: input.R1, R2: input.R2, AB: input.AB, t1: first.tangentLength, t2: second.tangentLength,
    l1: first.arcLength, l2: second.arcLength, commonTangent, arcLength, totalLength, isApprox: false };
}

// ─── CLOTHOID TRANSITION SPIRALS (EULER SPIRALS) ────────────────────────────

export interface ClothoidSpiralElements {
  radius: number // Circular curve radius R (metres)
  spiralLength: number // Spiral transition length Ls (metres)
  spiralParameter: number // Clothoid parameter A = sqrt(R * Ls)
  spiralAngleRadians: number // θs = Ls / (2R)
  spiralAngleDegrees: number
  spiralAngleDMS: string
  shiftP: number // p ≈ Ls^2 / (24R) - Ls^4 / (2688R^3)
  tangentShiftK: number // k ≈ Ls / 2 - Ls^3 / (240R^2)
  tangentX: number // X coordinate along tangent at SC
  tangentY: number // Y coordinate (offset) at SC
  longTangent: number // Long tangent Ts1 = X - Y / tan(θs)
  shortTangent: number // Short tangent Ts2 = Y / sin(θs)
  totalTangentLength?: number // Ts = (R + p) * tan(Δ / 2) + k
}

/**
 * Computes Clothoid Transition Spiral elements per RDM 1.3 / AASHTO standards.
 * Curvature increases linearly from 0 at TS (Tangent-Spiral) to 1/R at SC (Spiral-Curve).
 */
export function computeClothoidSpiral(
  radius: number,
  spiralLength: number,
  totalDeflectionDeg?: number
): ClothoidSpiralElements {
  const R = radius
  const Ls = spiralLength

  // Parameter A = sqrt(R * Ls)
  const A = Math.sqrt(R * Ls)

  // Total spiral angle θs = Ls / (2R) in radians
  const thetaS_rad = Ls / (2 * R)
  const thetaS_deg = (thetaS_rad * 180) / Math.PI
  const thetaS_DMS = bearingToString(thetaS_deg)

  // Shift of the circular arc (p): p ≈ Ls^2 / (24R) - Ls^4 / (2688R^3)
  const Ls2 = Ls * Ls
  const R2 = R * R
  const shiftP = Ls2 / (24 * R) - (Ls2 * Ls2) / (2688 * R * R2)

  // Tangent shift (k): k ≈ Ls / 2 - Ls^3 / (240R^2)
  const tangentShiftK = Ls / 2 - (Ls * Ls2) / (240 * R2)

  // Tangent coordinates (X, Y) at SC using Taylor series expansion:
  // X = Ls * (1 - Ls^2 / (40 R^2) + Ls^4 / (3456 R^4))
  // Y = (Ls^2 / (6 R)) * (1 - Ls^2 / (56 R^2))
  const tangentX = Ls * (1 - Ls2 / (40 * R2) + (Ls2 * Ls2) / (3456 * R2 * R2))
  const tangentY = (Ls2 / (6 * R)) * (1 - Ls2 / (56 * R2))

  // Spiral tangents
  const tanTheta = Math.tan(thetaS_rad)
  const sinTheta = Math.sin(thetaS_rad)
  const longTangent = tangentX - (tanTheta !== 0 ? tangentY / tanTheta : 0)
  const shortTangent = sinTheta !== 0 ? tangentY / sinTheta : 0

  let totalTangentLength: number | undefined
  if (totalDeflectionDeg !== undefined) {
    const deltaRad = (totalDeflectionDeg * Math.PI) / 180
    totalTangentLength = (R + shiftP) * Math.tan(deltaRad / 2) + tangentShiftK
  }

  return {
    radius: R,
    spiralLength: Ls,
    spiralParameter: A,
    spiralAngleRadians: thetaS_rad,
    spiralAngleDegrees: thetaS_deg,
    spiralAngleDMS: thetaS_DMS,
    shiftP,
    tangentShiftK,
    tangentX,
    tangentY,
    longTangent,
    shortTangent,
    totalTangentLength,
  }
}

// ─── ADVANCED VERTICAL CURVE WITH TURNING POINTS & DRAINAGE ─────────────────

export interface VerticalCurveAnalysis {
  curveType: 'crest' | 'sag' | 'flat'
  g1: number // %
  g2: number // %
  gradeDifferenceA: number // |g2 - g1| %
  length: number // m
  kValue: number // K = L / A
  stationVPC: number
  elevationVPC: number
  stationVPI: number
  elevationVPI: number
  stationVPT: number
  elevationVPT: number
  turningStation?: number // High point for crest, low point for sag
  turningElevation?: number
  hasDrainageTurningPoint: boolean
  isKCompliantRDM: boolean // Min K >= 15 for 80 km/h crest per RDM 1.3
}

/**
 * Calculates Vertical Parabolic Curve geometry with exact high/low turning points for drainage design.
 */
export function computeVerticalCurveAnalysis(input: {
  g1: number // incoming grade in % (e.g. +3.5)
  g2: number // outgoing grade in % (e.g. -2.0)
  length: number // curve length L in metres
  stationVPI: number
  elevationVPI: number
  designSpeedKmh?: number // default 80 km/h
}): VerticalCurveAnalysis {
  const { g1, g2, length: L, stationVPI, elevationVPI, designSpeedKmh = 80 } = input

  const A = Math.abs(g2 - g1)
  const kVal = A > 0 ? L / A : 0

  const halfL = L / 2
  const stationVPC = stationVPI - halfL
  const stationVPT = stationVPI + halfL

  // VPC & VPT elevations
  const elevationVPC = elevationVPI - (g1 / 100) * halfL
  const elevationVPT = elevationVPI + (g2 / 100) * halfL

  // Determine curve type
  let curveType: 'crest' | 'sag' | 'flat' = 'flat'
  if (g1 > g2) curveType = 'crest'
  else if (g1 < g2) curveType = 'sag'

  // Turning point: x = -g1 * L / (g2 - g1)
  let turningStation: number | undefined
  let turningElevation: number | undefined
  let hasDrainageTurningPoint = false

  if (g1 * g2 < 0 && g2 !== g1) {
    // Turning point lies inside the curve if grades have opposite signs
    const xTurning = (-g1 * L) / (g2 - g1)
    if (xTurning >= 0 && xTurning <= L) {
      hasDrainageTurningPoint = true
      turningStation = stationVPC + xTurning
      // Elevation: y(x) = yVPC + (g1/100)*x + (g2 - g1)/(200*L) * x^2
      const yOffset = ((g2 - g1) / (200 * L)) * xTurning * xTurning
      turningElevation = elevationVPC + (g1 / 100) * xTurning + yOffset
    }
  }

  // Minimum K standards per Kenya RDM 1.3 Table 5.4:
  // 80 km/h: Crest K_min = 26, Sag K_min = 20
  const minK = curveType === 'crest' ? (designSpeedKmh >= 100 ? 52 : 26) : (designSpeedKmh >= 100 ? 30 : 20)
  const isKCompliantRDM = kVal >= minK

  return {
    curveType,
    g1,
    g2,
    gradeDifferenceA: A,
    length: L,
    kValue: kVal,
    stationVPC,
    elevationVPC,
    stationVPI,
    elevationVPI,
    stationVPT,
    elevationVPT,
    turningStation,
    turningElevation,
    hasDrainageTurningPoint,
    isKCompliantRDM,
  }
}

