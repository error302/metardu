/**
 * Engineering Computation Library
 * 
 * Civil engineering calculations and legacy adapters. Individual calculations
 * require their own criteria, provenance and verification; this module does not
 * establish blanket standards compliance or a coordinate reference system.
 * All distances in metres, angles in decimal degrees unless otherwise specified.
 * 
 * @packageDocumentation
 */

import { z } from 'zod';
import { horizontalCurveElements, curveSetOut } from '@/lib/computations/roadDesignEngine';
import type { createClient } from '@/lib/api-client/client';
import { logger } from '@/lib/logger'
import { endAreaVolume, prismoidalVolumeFromMidSection } from '@/lib/engine/engineering'

let dbClient: ReturnType<typeof createClient> | null = null;

export async function initComputeLogger() {
  const { createClient } = await import('@/lib/api-client/client');
  dbClient = createClient();
}

async function logComputation(
  computationType: string,
  input: unknown,
  result: unknown,
  projectId?: string,
  userId?: string
) {
  if (!dbClient) {
    try {
      const { createClient } = await import('@/lib/api-client/client');
      dbClient = createClient();
    } catch {
      logger.warn('Compute logger: DbClient not available');
      return;
    }
  }
  
  if (!dbClient) return;
  
  try {
    await dbClient.from('engineering_compute_logs').insert({
      computation_type: computationType,
      project_id: projectId,
      user_id: userId,
      input,
      result,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    logger.warn('Compute logger: Failed to log', { error: e });
  }
}

export async function logEngineeringCompute(
  computationType: string,
  input: unknown,
  result: unknown,
  options?: { projectId?: string; userId?: string }
) {
  return logComputation(computationType, input, result, options?.projectId, options?.userId);
}

/**
 * Input validation schemas per RDM 1.1 / KeRRA standards
 */

// Horizontal Curve Input
// Reference: RDM 1.1 Volume 2, Chapter 3 - Horizontal Alignment
export const HorizontalCurveSchema = z.object({
  R: z.number().finite().positive(),
  deltaDeg: z.number().finite().positive().lt(180, 'Central angle must be less than 180 degrees'),
  // Historical name: this is the PI/IP station, not TC. Signed stations are valid.
  chainageStart: z.number().finite(),
});

export type HorizontalCurveInput = z.infer<typeof HorizontalCurveSchema>;

// Vertical Curve Input
// Reference: RDM 1.1 Volume 2, Chapter 4 - Vertical Alignment
export const VerticalCurveSchema = z.object({
  L: z.number().positive().min(40, 'Minimum curve length 40m per RDM 1.1'),
  g1: z.number().min(-15).max(15, 'Grade must be between -15% and +15%'),
  g2: z.number().min(-15).max(15),
  chainage_VIP: z.number().min(0),
  elevation_VIP: z.number(),
  designSpeedKph: z.number().positive().min(20).max(120).optional().default(80),
  K: z.number().positive().optional(),
});

export type VerticalCurveInput = z.infer<typeof VerticalCurveSchema>;

// Superelevation Input
// Reference: RDM 1.1 Volume 2, Section 3.4 - Superelevation
// KeRRA Rural Roads Design Manual Section 4.2
export const SuperelevationSchema = z.object({
  R: z.number().positive().max(2000, 'Maximum radius 2000m'),
  V: z.number().positive().min(20).max(120, 'Design speed 20-120 km/h'),
  eMax: z.number().positive().max(0.12).default(0.07),
  transitionLength: z.number().positive().optional(),
});

export type SuperelevationInput = z.infer<typeof SuperelevationSchema>;

// Cross Section Volume Input
// Reference: RDM 1.1 Volume 3, Chapter 2 - Earthworks
export const CrossSectionVolumeSchema = z.object({
  areas: z.array(z.number().finite()).min(2, 'Need at least 2 cross-sections').max(10000),
  stationInterval: z.number().finite().positive().max(100, 'Max interval 100m').default(20),
  method: z.enum(['prismoidal', 'end-area']).default('prismoidal'),
});

export type CrossSectionVolumeInput = z.infer<typeof CrossSectionVolumeSchema>;

// Mass Haul Diagram Input
export const MassHaulSchema = z.object({
  // Historical field name: these are incremental net volumes, accumulated once.
  cumulativeVolumes: z.array(z.number().finite()).min(2).max(10000),
  stationInterval: z.number().finite().positive().default(20),
  stations: z.array(z.number().finite()).min(2).max(10000).optional(),
}).superRefine((input, ctx) => {
  if (input.stations && (input.stations.length !== input.cumulativeVolumes.length ||
    input.stations.some((station, i, stations) => i > 0 && station <= stations[i - 1]))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stations'], message: 'Supply one strictly increasing chainage per volume.' });
  }
});

export type MassHaulInput = z.infer<typeof MassHaulSchema>;

/**
 * Horizontal Curve Elements
 * 
 * Computes all curve elements per RDM 1.1:
 * - T: Tangent Length
 * - L: Curve Length (arc)
 * - LC: Long Chord
 * - M: Mid-Ordinate
 * - E: External Distance
 * - Setting out table at 20m intervals
 * 
 * @param input - Curve parameters
 * @returns Complete curve elements and setting-out table
 * 
 * @example
 * ```ts
 * const result = horizontalCurve({
 *   R: 300,
 *   deltaDeg: 45,
 *   chainageStart: 1000
 * });
 * // Returns T, L, LC, M, E, chainage_TC, chainage_CT, settingOutTable
 * ```
 */
export interface HorizontalCurveResult {
  /** Tangent Length (T = R × tan(Δ/2)) */
  T: number;
  /** Curve Length - Arc (L = R × Δ in radians) */
  L: number;
  /** Long Chord (LC = 2R × sin(Δ/2)) */
  LC: number;
  /** Mid-Ordinate (M = R × (1 - cos(Δ/2))) */
  M: number;
  /** External Distance (E = R × (1/cos(Δ/2) - 1)) */
  E: number;
  deflectionAngleDeg: number;
  chainageStart: number;
  chainage_TC: number;
  chainage_CT: number;
  settingOutTable: SettingOutRow[];
}

export interface SettingOutRow {
  chainage: number;
  deflectionFromTC: number;
  chordFromTC: number;
  chordIncrement: number;
}

export function horizontalCurve(input: HorizontalCurveInput): HorizontalCurveResult {
  const { R, deltaDeg, chainageStart } = HorizontalCurveSchema.parse(input);
  const degrees = Math.floor(deltaDeg);
  const remainingMinutes = (deltaDeg - degrees) * 60;
  const minutes = Math.floor(remainingMinutes);
  const geometry = { radius: R, deflectionAngleDeg: degrees, deflectionAngleMin: minutes,
    deflectionAngleSec: (remainingMinutes - minutes) * 60, ipChainage: chainageStart };
  const result = horizontalCurveElements(geometry);
  const setout = curveSetOut({ ...geometry, tcChainage: result.tcChainage, ctChainage: result.ctChainage, interval: 20 });
  return {
    T: result.tangentLength, L: result.curveLength, LC: result.longChord,
    M: result.midOrdinate, E: result.externalDistance,
    deflectionAngleDeg: deltaDeg, chainageStart,
    chainage_TC: result.tcChainage, chainage_CT: result.ctChainage,
    settingOutTable: setout.rows.map(row => ({
      chainage: row.chainage,
      deflectionFromTC: (row.chainage - result.tcChainage) / R * 90 / Math.PI,
      chordFromTC: 2 * R * Math.sin((row.chainage - result.tcChainage) / R / 2),
      chordIncrement: row.chord,
    })),
  };
}

/**
 * Vertical Curve Computation
 * 
 * Parabolic vertical curve per RDM 1.1 Volume 2, Chapter 4:
 * - Computes elevation at any point on curve
 * - K value (rate of vertical curvature) per sight distance requirements
 * - Automatic crest/sag classification
 * 
 * @param input - Vertical curve parameters
 * @returns Elevation table and curve properties
 */
export interface VerticalCurveResult {
  gradeIn: number;
  gradeOut: number;
  algebraicDiff: number;
  kValue: number;
  length: number;
  isCrest: boolean;
  chainage_VPC: number;
  chainage_VPT: number;
  sightDistance: number;
  elevationTable: VerticalCurvePoint[];
}

export interface VerticalCurvePoint {
  chainage: number;
  elevation: number;
  grade: number;
  cutFill: number;
}

export function verticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const parsed = VerticalCurveSchema.parse(input);
  const { L: curveLength, g1, g2, chainage_VIP, elevation_VIP, designSpeedKph } = parsed;

  const A = g2 - g1;
  const K = curveLength / Math.abs(A);
  const isCrest = A < 0;

  // RDM 1.1 minimum K values for stopping sight distance

  const chainage_VPC = chainage_VIP - curveLength / 2;
  const chainage_VPT = chainage_VIP + curveLength / 2;
  const elevation_VPC = elevation_VIP - (g1 / 100) * (curveLength / 2);

  // Stopping sight distance (SSD) per RDM 1.1
  const SSD = 0.278 * designSpeedKph * 2.5 + Math.pow(designSpeedKph, 2) / (254 * (Math.abs(A) / 100));

  const elevationTable: VerticalCurvePoint[] = [];
  const step = 20;

  let ch = Math.ceil(chainage_VPC / step) * step;
  while (ch <= chainage_VPT) {
    const x = ch - chainage_VPC;
    // Parabolic equation: y = y₀ + g₁x + (A/200L)x²
    const elevation = elevation_VPC + (g1 / 100) * x + (A / (200 * curveLength)) * x * x;
    const grade = g1 + (A / curveLength) * x;
    
    elevationTable.push({
      chainage: parseFloat(ch.toFixed(3)),
      elevation: parseFloat(elevation.toFixed(4)),
      grade: parseFloat(grade.toFixed(4)),
      cutFill: 0 // To be filled when design level is provided
    });
    ch += step;
  }

  return {
    gradeIn: g1,
    gradeOut: g2,
    algebraicDiff: parseFloat(A.toFixed(4)),
    kValue: parseFloat(K.toFixed(2)),
    length: curveLength,
    isCrest,
    chainage_VPC: parseFloat(chainage_VPC.toFixed(3)),
    chainage_VPT: parseFloat(chainage_VPT.toFixed(3)),
    sightDistance: parseFloat(SSD.toFixed(1)),
    elevationTable
  };
}

/**
 * Superelevation Calculation
 * 
 * Per RDM 1.1 Section 3.4 and KeRRA Design Manual:
 * - Maximum superelevation eMax = 7% for rural roads (can be 8% in special cases)
 * - Minimum transition length per KeRRA
 * - Rate of superelevation application
 * 
 * @param input - Superelevation parameters
 * @returns Applied superelevation and transition table
 */
export interface SuperelevationResult {
  eDesign: number;
  eMax: number;
  transitionLength: number;
  rate: number;
  table: SuperelevationRow[];
}

export interface SuperelevationRow {
  chainageOffset: number;
  eApplied: number;
  rotation: 'left' | 'right' | 'both';
}

/**
 * Calculate superelevation for a curve
 * 
 * Formula: e = V²/(225R) - f (where f = 0.01 minimum normal crown)
 * Reference: RDM 1.1 Equation 3.1
 */
export function superelevationCalc(input: SuperelevationInput): SuperelevationResult {
  const parsed = SuperelevationSchema.parse(input);
  const { R, V, eMax, transitionLength } = parsed;

  // RDM 1.1 formula: e = V²/(225R) - 0.01
  const e = (V * V) / (225 * R) - 0.01;
  const eDesign = Math.min(Math.max(e, 0), eMax);

  // KeRRA minimum transition length: L = 0.6V²/R (minimum 30m)
  const L = transitionLength || Math.max(0.6 * (V * V) / R, 30);
  
  const rate = eDesign / L;

  // Generate transition table
  const table: SuperelevationRow[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    table.push({
      chainageOffset: parseFloat((progress * L).toFixed(2)),
      eApplied: parseFloat((eDesign * progress * 100).toFixed(2)),
      rotation: 'both'
    });
  }

  return {
    eDesign: parseFloat((eDesign * 100).toFixed(2)),
    eMax: parseFloat((eMax * 100).toFixed(2)),
    transitionLength: parseFloat(L.toFixed(2)),
    rate: parseFloat((rate * 100).toFixed(4)),
    table
  };
}

/**
 * Cross-Section Volume Calculation
 * 
 * Computes earthwork volumes using:
 * - Prismoidal method with supplied middle sections
 * - Average end-area method; linear signed-area split at cut/fill transitions
 * 
 * @param input - Cross-section areas and station interval
 * @returns Volume table with cut/fill per station
 */
export interface CrossSectionVolumeResult {
  method: 'prismoidal' | 'end-area';
  totalCut: number;
  totalFill: number;
  netVolume: number;
  isBalanced: boolean;
  volumeTable: VolumeRow[];
  calculationNotes: string[];
}

export interface VolumeRow {
  station: number;
  cutArea: number;
  fillArea: number;
  cutVolume: number;
  fillVolume: number;
  cumulativeCut: number;
  cumulativeFill: number;
  /** A Simpson group is reported at its end row; its middle row has no independent volume. */
  methodApplied: 'origin' | 'midsection' | 'prismoidal' | 'end-area' | 'end-area-zero-crossing';
  spanM: number;
}

export function crossSectionVolume(input: CrossSectionVolumeInput): CrossSectionVolumeResult {
  const parsed = CrossSectionVolumeSchema.parse(input);
  const { areas, stationInterval, method } = parsed;

  const segments = areas.map(() => ({
    cut: 0, fill: 0, spanM: 0, methodApplied: 'origin' as VolumeRow['methodApplied'],
  }));
  let usedCrossing = false;
  let usedEndArea = false;

  const integratePair = (end: number) => {
    const a = areas[end - 1];
    const b = areas[end];
    let cut = 0;
    let fill = 0;
    const crosses = (a > 0 && b < 0) || (a < 0 && b > 0);
    if (crosses) {
      // Signed-area input cannot describe mixed cut/fill at one section.
      // Assume linear area variation between these wholly cut/fill sections.
      const firstLength = stationInterval * (Math.abs(a) / (Math.abs(a) + Math.abs(b)));
      const firstVolume = Math.abs(a) * firstLength / 2;
      const secondVolume = Math.abs(b) * (stationInterval - firstLength) / 2;
      cut = a > 0 ? firstVolume : secondVolume;
      fill = a < 0 ? firstVolume : secondVolume;
      usedCrossing = true;
    } else {
      const volume = endAreaVolume(a, b, stationInterval);
      cut = Math.max(0, volume);
      fill = Math.max(0, -volume);
    }
    segments[end] = { cut, fill, spanM: stationInterval, methodApplied: crosses ? 'end-area-zero-crossing' : 'end-area' };
    usedEndArea = true;
  };

  let start = 0;
  while (start < areas.length - 1) {
    const group = areas.slice(start, start + 3);
    const sameSign = group.every(area => area >= 0) || group.every(area => area <= 0);
    if (method === 'prismoidal' && group.length === 3 && sameSign) {
      // L spans TWO equally spaced intervals: L/6 = d/3.
      const volume = prismoidalVolumeFromMidSection(group[0], group[1], group[2], 2 * stationInterval);
      segments[start + 1] = { cut: 0, fill: 0, spanM: 0, methodApplied: 'midsection' };
      segments[start + 2] = { cut: Math.max(0, volume), fill: Math.max(0, -volume), spanM: 2 * stationInterval, methodApplied: 'prismoidal' };
      start += 2;
    } else {
      integratePair(start + 1);
      start += 1;
    }
  }

  const volumeTable: VolumeRow[] = [];
  let cumulativeCut = 0;
  let cumulativeFill = 0;

  for (let i = 0; i < areas.length; i++) {
    const station = i * stationInterval;
    const currentArea = areas[i];
    const cutArea = currentArea > 0 ? currentArea : 0;
    const fillArea = currentArea < 0 ? Math.abs(currentArea) : 0;

    const { cut: cutVolume, fill: fillVolume, methodApplied, spanM } = segments[i];

    cumulativeCut += cutVolume;
    cumulativeFill += fillVolume;
    if (![cutVolume, fillVolume, cumulativeCut, cumulativeFill].every(Number.isFinite)) {
      throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['areas'], message: 'Areas and interval produce a non-finite volume. Check their magnitude and units.' }]);
    }

    volumeTable.push({
      station,
      cutArea: parseFloat(cutArea.toFixed(2)),
      fillArea: parseFloat(fillArea.toFixed(2)),
      cutVolume: parseFloat(cutVolume.toFixed(2)),
      fillVolume: parseFloat(fillVolume.toFixed(2)),
      cumulativeCut: parseFloat(cumulativeCut.toFixed(2)),
      cumulativeFill: parseFloat(cumulativeFill.toFixed(2)),
      methodApplied,
      spanM,
    });
  }

  const totalCut = cumulativeCut;
  const totalFill = cumulativeFill;
  const netVolume = totalCut - totalFill;

  return {
    method,
    totalCut: parseFloat(totalCut.toFixed(2)),
    totalFill: parseFloat(totalFill.toFixed(2)),
    netVolume: parseFloat(netVolume.toFixed(2)),
    isBalanced: Math.abs(netVolume) <= Number.EPSILON * Math.max(1, totalCut, totalFill) * 8,
    volumeTable,
    calculationNotes: [
      'Signed areas represent wholly cut or wholly fill sections; a net area is insufficient for mixed cross-sections.',
      'Geometric quantities only. Shrink/swell, material classification, alignment curvature and construction approval are not assessed.',
      ...(method === 'prismoidal' ? ['Prismoidal groups use three equally spaced supplied sections, spanning two intervals. Group quantities are reported at the end section; the middle section is not an independent volume.'] : []),
      ...(method === 'prismoidal' && usedEndArea ? ['Intervals without a same-sign three-section group use average end-area.'] : []),
      ...(usedCrossing ? ['Cut/fill transitions use a linearly interpolated zero-area section and separate triangular volumes; survey additional sections to confirm the transition.'] : []),
    ],
  };
}

/**
 * Mass Haul Diagram
 * 
 * Generates cumulative mass-haul diagram for earthwork balancing:
 * - Cumulative volume curve
 * - Balance point detection
 * - Haul and overhaul calculations
 * 
 * Reference: RDM 1.1 Volume 3, Section 2.6
 * 
 * @param input - Array of cut/fill volumes (positive = cut, negative = fill)
 * @returns Cumulative values and balance points
 */
export interface MassHaulResult {
  cumulativeVolume: number[];
  maxSurplus: number;
  maxDeficit: number;
  balancePoint: number | null;
  haulDistance: number;
  overhaulDistance: number;
  diagram: MassHaulPoint[];
}

export interface MassHaulPoint {
  station: number;
  volume: number;
  cumulative: number;
  zone: 'cut' | 'fill' | 'balance';
}

export function massHaulDiagram(input: MassHaulInput): MassHaulResult {
  const parsed = MassHaulSchema.parse(input);
  const { cumulativeVolumes, stationInterval } = parsed;
  const stations = parsed.stations ?? cumulativeVolumes.map((_, i) => i * stationInterval);

  const cumulative: number[] = [];
  let running = 0;

  for (const vol of cumulativeVolumes) {
    running += vol;
    if (!Number.isFinite(running)) throw new RangeError('Mass-haul accumulation must remain finite.');
    cumulative.push(running);
  }

  const maxSurplus = Math.max(...cumulative, 0);
  const maxDeficit = Math.min(...cumulative, 0);

  // Find balance point (where cumulative crosses zero)
  let balancePoint: number | null = null;
  for (let i = 1; i < cumulative.length; i++) {
    if ((cumulative[i - 1] < 0 && cumulative[i] >= 0) || 
        (cumulative[i - 1] > 0 && cumulative[i] <= 0)) {
      const fraction = Math.abs(cumulative[i - 1]) / (Math.abs(cumulative[i - 1]) + Math.abs(cumulative[i]));
      balancePoint = stations[i - 1] + fraction * (stations[i] - stations[i - 1]);
      break;
    }
  }

  // Calculate haul distance (area under cumulative curve)
  let haulDistance = 0;
  for (let i = 1; i < cumulative.length; i++) {
    const a = cumulative[i - 1], b = cumulative[i];
    const span = stations[i] - stations[i - 1];
    if (a * b < 0) {
      const fraction = Math.abs(a) / (Math.abs(a) + Math.abs(b));
      haulDistance += span * (Math.abs(a) * fraction + Math.abs(b) * (1 - fraction)) / 2;
    } else haulDistance += (Math.abs(a) + Math.abs(b)) * span / 2;
  }

  // Simplified overhaul calculation
  const overhaulDistance = Math.abs(maxDeficit) * stationInterval * 0.5;

  const diagram: MassHaulPoint[] = cumulativeVolumes.map((vol, i) => ({
    station: stations[i],
    volume: vol,
    cumulative: cumulative[i],
    zone: vol > 0 ? 'cut' : vol < 0 ? 'fill' : 'balance'
  }));

  return {
    cumulativeVolume: cumulative.map(v => parseFloat(v.toFixed(2))),
    maxSurplus: parseFloat(maxSurplus.toFixed(2)),
    maxDeficit: parseFloat(maxDeficit.toFixed(2)),
    balancePoint,
    haulDistance: parseFloat(haulDistance.toFixed(2)),
    overhaulDistance: parseFloat(overhaulDistance.toFixed(2)),
    diagram
  };
}

/**
 * Widening on Curves
 * 
 * Additional carriageway width on small radius curves per RDM 1.1 Section 3.5
 * 
 * @param R - Radius in metres
 * @param baseWidth - Base carriageway width (default 7.0m)
 * @returns Extra width to be added
 */
export interface WideningResult {
  radius: number;
  baseWidth: number;
  extraWidth: number;
  totalWidth: number;
}

export function wideningOnCurve(R: number, baseWidth: number = 7.0): WideningResult {
  // RDM 1.1 formula: W = 80/R for single lane addition
  // Simplified: extra width proportional to 1/R
  let extraWidth = 0;
  
  if (R < 300) {
    extraWidth = 0.5; // 0.5m for R < 300m
  } else if (R < 500) {
    extraWidth = 0.3; // 0.3m for R 300-500m
  } else if (R < 750) {
    extraWidth = 0.2; // 0.2m for R 500-750m
  }

  return {
    radius: R,
    baseWidth,
    extraWidth: parseFloat(extraWidth.toFixed(2)),
    totalWidth: parseFloat((baseWidth + extraWidth).toFixed(2))
  };
}

/**
 * Stopping Sight Distance Calculation
 * 
 * Per RDM 1.1 Section 2.3 and AASHTO
 * 
 * @param V - Design speed in km/h
 * @param grade - Grade in percent (positive for uphill)
 * @returns SSD in metres
 */
export function stoppingSightDistance(V: number, grade: number = 0): number {
  // AASHTO SSD formula: SSD = 0.278VT + V²/(254(f+G))
  // Where T = 2.5s perception-reaction time
  const T = 2.5;
  const f = 0.35; // friction coefficient
  
  const term1 = 0.278 * V * T;
  const term2 = (V * V) / (254 * (f + grade / 100));
  
  return parseFloat((term1 + term2).toFixed(1));
}

/**
 * Passing Sight Distance
 * 
 * Per RDM 1.1 for overtaking maneuvers
 */
export function passingSightDistance(V: number): number {
  // PSD = 3 * SSD approximately
  return parseFloat((3 * stoppingSightDistance(V)).toFixed(1));
}

/**
 * Minimum Curve Radius
 * 
 * Per RDM 1.1 based on design speed and superelevation
 */
export function minimumRadius(V: number, e: number = 0.07, f: number = 0.15): number {
  // R = V²/(127(e+f))
  return parseFloat((V * V / (127 * (e + f))).toFixed(1));
}
