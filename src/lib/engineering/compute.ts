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
import { superelevationDesign, type SuperelevationResult as DeclaredSuperelevationResult } from '@/lib/computations/roadSafetyCriteria';
import { horizontalCurveElements, curveSetOut, horizontalCurveInputFromDecimal } from '@/lib/computations/roadDesignEngine';
import { verticalCurve as legacyVerticalProfile, type VerticalCurveResult as LegacyVerticalResult,
  type VerticalCurvePoint as LegacyVerticalPoint } from './curves';
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
 * Input contracts. Geometry domains do not establish adopted design criteria.
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

// Geometry input only. Adopted design criteria and sight distance require
// separate evidence; no default speed or untraced standards limits are applied.
export const VerticalCurveSchema = z.object({
  L: z.number().finite().positive(),
  g1: z.number().finite(),
  g2: z.number().finite(),
  chainage_VIP: z.number().finite(),
  elevation_VIP: z.number().finite(),
  interval: z.number().finite().positive().optional(),
}).strict();

export type VerticalCurveInput = z.infer<typeof VerticalCurveSchema>;

// No defaults or legacy aliases: callers must supply the complete rotated-width
// model and their declared project criteria. Slopes are ratios, not percentages.
export const SuperelevationSchema = z.object({
  designSpeed: z.number().finite().positive(),
  radius: z.number().finite().positive(),
  numLanes: z.number().finite().int().positive(),
  laneWidth: z.number().finite().positive(),
  initialCrossfall: z.number().finite().gt(-1).lt(1),
  providedSuperelevation: z.number().finite().min(0).lt(1),
  criteria: z.object({
    reference: z.string().trim().min(1).max(512),
    lateralFriction: z.number().finite().min(0).lt(1),
    maximumSuperelevation: z.number().finite().positive().lt(1),
    maximumRelativeGradient: z.number().finite().positive().lt(1),
  }).strict(),
}).strict();

export type SuperelevationInput = z.infer<typeof SuperelevationSchema>;

// Cross Section Volume Input
// Reference: RDM 1.1 Volume 3, Chapter 2 - Earthworks
export const CrossSectionVolumeSchema = z.object({
  areas: z.array(z.number().finite()).min(2, 'Need at least 2 cross-sections').max(10000),
  stationInterval: z.number().finite().positive().max(100, 'Max interval 100m').prefault(20),
  method: z.enum(['prismoidal', 'end-area']).prefault('prismoidal'),
});

export type CrossSectionVolumeInput = z.infer<typeof CrossSectionVolumeSchema>;

// Mass Haul Diagram Input
export const MassHaulSchema = z.object({
  // Historical field name: these are incremental net volumes, accumulated once.
  cumulativeVolumes: z.array(z.number().finite()).min(2).max(10000),
  stationInterval: z.number().finite().positive().prefault(20),
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
  const geometry = horizontalCurveInputFromDecimal(R, deltaDeg, chainageStart);
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
      chordFromTC: R * (2 * Math.sin((row.chainage - result.tcChainage) / R / 2)),
      chordIncrement: row.chord,
    })),
  };
}

/**
 * Vertical Curve Computation
 * 
 * Symmetric parabolic geometry from explicit VPI, percent grades and length.
 * No sight distance or earthwork cut/fill can be inferred from those inputs.
 * 
 * @param input - Vertical curve parameters
 * @returns Elevation table and curve properties
 */
export interface VerticalCurveResult extends LegacyVerticalResult {
  sightDistance: null;
  sightDistanceStatus: 'NOT_ASSESSED';
  elevationTable: VerticalCurvePoint[];
}

export interface VerticalCurvePoint extends LegacyVerticalPoint {
  cutFill: null; // No measured ground profile is supplied.
}

export function verticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const parsed = VerticalCurveSchema.parse(input);
  const result = legacyVerticalProfile({ gradeIn: parsed.g1, gradeOut: parsed.g2, length: parsed.L,
    chainage_VIP: parsed.chainage_VIP, elevation_VIP: parsed.elevation_VIP, interval: parsed.interval });
  return {
    ...result, sightDistance: null, sightDistanceStatus: 'NOT_ASSESSED',
    elevationTable: result.elevationTable.map(row => ({ ...row, cutFill: null })),
  };
}

/** Declared banking assessment; no inferred stationing or standards approval.
 * Breaking legacy contract: banking is returned as a ratio, with explicit
 * limit/demand outcomes and the caller's criteria reference. Transition length
 * describes crossfall rotation about the supplied width, not a spiral layout.
 */
export type SuperelevationResult = DeclaredSuperelevationResult;

export function superelevationCalc(input: SuperelevationInput): SuperelevationResult {
  return superelevationDesign(SuperelevationSchema.parse(input));
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
