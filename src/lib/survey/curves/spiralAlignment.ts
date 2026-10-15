/**
 * Spiral-to-Curve Alignment Engine
 *
 * Roadmap reference: docs/ROADMAP.md → Tier 2 → "Spiral-to-curve alignment
 * engine". Implements a full TS → SC → CS → ST alignment with clothoid
 * transition spirals on both ends of a circular curve.
 *
 * Stationing convention (Schofield / AASHTO):
 *
 *   TS (Tangent-to-Spiral)    start of entry spiral
 *   SC (Spiral-to-Curve)      end of entry spiral / start of circular curve
 *   CS (Curve-to-Spiral)      end of circular curve / start of exit spiral
 *   ST (Spiral-to-Tangent)    end of exit spiral
 *
 * Geometry (per AASHTO Green Book 2018 §3-Exhibit 3-22):
 *
 *   Δ     = intersection angle between approach and departure tangents (rad)
 *   R     = circular curve radius (m)
 *   Ls    = spiral length (m)
 *   θs    = Ls / (2R)              spiral angle (rad)
 *   p     = y - R·(1 - cos θs)     tangent shift (offset of curve from tangent)
 *   k     = x - R·sin θs           tangent extension (TS to shifted PI)
 *   T     = k + (R + p)·tan(Δ/2)   total tangent distance TS → PI
 *   Lc    = R·(Δ - 2θs)            circular curve length (m)
 *
 * The clothoid spiral coordinates (relative to TS, tangent along +X) are
 * computed via the standard series expansion (used by `transition.ts`).
 *
 * Output is a full station table plus a coordinate array that can be fed
 * directly to OpenLayers `LineString` or any other rendering layer.
 *
 * References:
 *   - Schofield, W. (2001) "Engineering Surveying", Chapter 12
 *   - AASHTO Green Book (2018), Chapter 3 — Horizontal Alignment
 *   - KeNHA Road Design Manual, Part 4 — Horizontal Curves
 */

import type { SpiralCurveResult } from './transition'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpiralAlignmentInput {
  /** Radius of the circular curve (metres). */
  radius: number
  /**
   * Intersection angle Δ in decimal degrees. This is the deflection
   * between the approach and departure tangents — i.e., 180° minus the
   * interior angle at the PI.
   */
  intersectionAngleDeg: number
  /** Spiral length Ls in metres (both spirals assumed equal). */
  spiralLength: number
  /** Chainage of the PI (Point of Intersection) in metres. */
  piChainage: number
  /**
   * Bearing of the approach tangent in decimal degrees (0° = North, clockwise).
   * Used to compute world coordinates; defaults to 0 (North).
   */
  approachBearingDeg?: number
  /** Easting of the PI (optional, for world-coordinate output). */
  piEasting?: number
  /** Northing of the PI (optional, for world-coordinate output). */
  piNorthing?: number
}

export interface SpiralAlignmentResult {
  /** Echoed input. */
  input: SpiralAlignmentInput
  /** Underlying spiral math (single spiral, applied symmetrically). */
  spiral: SpiralCurveResult
  /** Intersection angle in radians. */
  deltaRad: number
  /** Spiral angle θs in radians. */
  thetaSRad: number
  /** Tangent shift p (m). */
  p: number
  /** Tangent extension k (m, TS to shifted PI). */
  k: number
  /** Total tangent distance T (m, TS to PI). */
  T: number
  /** Circular curve length Lc (m, SC to CS). */
  Lc: number
  /** Total alignment length (m, TS to ST). Ls + Lc + Ls. */
  totalLength: number
  /** Chainage at TS. */
  tsChainage: number
  /** Chainage at SC. */
  scChainage: number
  /** Chainage at CS. */
  csChainage: number
  /** Chainage at ST. */
  stChainage: number
  /** World coordinates of TS (if PI coords supplied). */
  tsCoord: { easting: number; northing: number } | null
  /** World coordinates of SC. */
  scCoord: { easting: number; northing: number } | null
  /** World coordinates of CS. */
  csCoord: { easting: number; northing: number } | null
  /** World coordinates of ST. */
  stCoord: { easting: number; northing: number } | null
  /** World coordinates of PI (echoed). */
  piCoord: { easting: number; northing: number } | null
}

export interface AlignmentStation {
  /** Chainage (m). */
  chainage: number
  /** Distance from TS (m). */
  distanceFromTS: number
  /** Easting (m, world coords if PI supplied, else local). */
  easting: number
  /** Northing (m, world coords if PI supplied, else local). */
  northing: number
  /** Signed offset from the approach tangent (m, +right). */
  offset: number
  /** Current segment. */
  segment: 'entry-spiral' | 'circular' | 'exit-spiral' | 'before' | 'after'
  /** Deflection angle from TS (decimal degrees, clockwise from approach tangent). */
  deflectionDeg: number
  /** Instantaneous tangent bearing, clockwise from North (world frame). */
  tangentBearingDeg: number
}

// ─── Geometry and stationing ─────────────────────────────────────────────

const DEG = Math.PI / 180
const MAX_STATIONS = 20_000
export const SPIRAL_ALIGNMENT_VERSION = '2.0.0'

/** Integrate cos(theta), sin(theta) for theta(s) = s²/(2RL).
 * The convergent series is evaluated to Float64 precision in the supported
 * range theta < pi/2, rather than rounding intermediate coordinates.
 * Clothoid definition: https://pro.arcgis.com/en/pro-app/latest/sdk/api-reference/topic75875.html
 */
function spiralDisplacement(distance: number, radius: number, length: number) {
  if (distance === 0) return { x: 0, y: 0, theta: 0 }
  const theta = (distance / radius) * (distance / length) / 2
  const square = theta * theta
  let tx = distance, ty = distance * theta / 3, x = tx, y = ty
  for (let n = 1; n <= 20; n++) {
    tx *= -square * (4 * n - 3) / ((2 * n - 1) * (2 * n) * (4 * n + 1))
    ty *= -square * (4 * n - 1) / ((2 * n) * (2 * n + 1) * (4 * n + 3))
    x += tx; y += ty
    if (Math.abs(tx) + Math.abs(ty) <= Number.EPSILON * (Math.abs(x) + Math.abs(y))) break
  }
  return { x, y, theta }
}

// Local +X is along the approach tangent, +Y is right of it. This gives a
// positive clockwise survey deflection without mirroring East/West on the map.
function localToWorld(ts: { easting: number; northing: number }, x: number, y: number, bearing: number) {
  return {
    easting: ts.easting + x * Math.sin(bearing) + y * Math.cos(bearing),
    northing: ts.northing + x * Math.cos(bearing) - y * Math.sin(bearing),
  }
}

/** Symmetric TS → SC → CS → ST; positive intersection angle turns right. */
export function computeSpiralAlignment(input: SpiralAlignmentInput): SpiralAlignmentResult {
  const { radius, intersectionAngleDeg, spiralLength: Ls, piChainage, approachBearingDeg = 0, piEasting, piNorthing } = input
  if (![radius, intersectionAngleDeg, Ls, piChainage, approachBearingDeg].every(Number.isFinite)) throw new RangeError('Alignment inputs must be finite numbers.')
  if (radius <= 0) throw new RangeError('Radius must be positive')
  if (Ls < 0) throw new RangeError('Spiral length must be non-negative')
  if (Math.abs(intersectionAngleDeg) < 1e-6) throw new RangeError('Intersection angle must be non-zero')
  if (Math.abs(intersectionAngleDeg) >= 180) throw new RangeError('Intersection angle must be less than 180 degrees in magnitude.')
  if ((piEasting === undefined) !== (piNorthing === undefined)) throw new RangeError('Supply both PI coordinates or leave both blank for local geometry.')
  if ([piEasting, piNorthing].some(value => value !== undefined && !Number.isFinite(value))) throw new RangeError('PI coordinates must be finite.')
  const thetaS = Ls / radius / 2, deltaRad = Math.abs(intersectionAngleDeg) * DEG
  if (2 * thetaS >= deltaRad) throw new RangeError('Spiral angles leave no room for circular curve. Reduce the spiral length or increase the intersection angle.')
  const { x, y } = spiralDisplacement(Ls, radius, Ls)
  const p = y - 2 * radius * Math.sin(thetaS / 2) ** 2
  const k = x - radius * Math.sin(thetaS)
  const T = k + (radius + p) * Math.tan(deltaRad / 2)
  const Lc = radius * (deltaRad - 2 * thetaS), totalLength = 2 * Ls + Lc
  const tsChainage = piChainage - T, scChainage = tsChainage + Ls
  const csChainage = scChainage + Lc, stChainage = csChainage + Ls
  if (![x, y, p, k, T, Lc, totalLength, tsChainage, scChainage, csChainage, stChainage].every(Number.isFinite)) throw new RangeError('Alignment exceeds the finite calculation range.')
  if (totalLength <= 0 || stChainage <= tsChainage || (Ls > 0 && (scChainage <= tsChainage || stChainage <= csChainage)) || csChainage <= scChainage) throw new RangeError('Chainages cannot resolve the supplied curve lengths at this magnitude.')
  const result: SpiralAlignmentResult = {
    input: { ...input },
    spiral: { radius, spiralLength: Ls, spiralAngle: thetaS / DEG, p, k, x, y, longChord: Math.hypot(x, y) },
    deltaRad, thetaSRad: thetaS, p, k, T, Lc, totalLength,
    tsChainage, scChainage, csChainage, stChainage,
    tsCoord: null, scCoord: null, csCoord: null, stCoord: null,
    piCoord: piEasting !== undefined && piNorthing !== undefined ? { easting: piEasting, northing: piNorthing } : null,
  }
  if (result.piCoord) {
    const bearing = (approachBearingDeg % 360) * DEG
    result.tsCoord = localToWorld(result.piCoord, -T, 0, bearing)
    const coordinate = (distance: number) => {
      const station = stationAtDistance(result, distance)
      if (!station) throw new RangeError('Unable to resolve an alignment station.')
      return { easting: station.easting, northing: station.northing }
    }
    result.scCoord = coordinate(Ls)
    result.csCoord = coordinate(Ls + Lc)
    result.stCoord = coordinate(totalLength)
  }
  return result
}

/** Exact station request within the saved alignment; no extrapolation. */
export function stationAtDistance(alignment: SpiralAlignmentResult, distanceFromTS: number): AlignmentStation | null {
  const { input, thetaSRad, deltaRad, T, tsChainage, totalLength, tsCoord, Lc } = alignment
  if (!Number.isFinite(distanceFromTS) || distanceFromTS < 0 || distanceFromTS > totalLength) return null
  const { radius, spiralLength: Ls, intersectionAngleDeg, approachBearingDeg = 0 } = input
  const d = distanceFromTS, turn = Math.sign(intersectionAngleDeg)
  let x: number, y: number, tangentAngle: number
  let segment: AlignmentStation['segment']
  if (Ls > 0 && d < Ls) {
    const spiral = spiralDisplacement(d, radius, Ls)
    x = spiral.x; y = spiral.y; tangentAngle = spiral.theta; segment = 'entry-spiral'
  } else if (Ls === 0 || d < Ls + Lc) {
    const entry = spiralDisplacement(Ls, radius, Ls)
    tangentAngle = thetaSRad + (d - Ls) / radius
    // Integrating the tangent around the positive local circular arc avoids
    // the former reversed rotation and preserves continuity at SC and CS.
    x = entry.x + radius * (Math.sin(tangentAngle) - Math.sin(thetaSRad))
    y = entry.y + radius * (Math.cos(thetaSRad) - Math.cos(tangentAngle))
    segment = 'circular'
  } else {
    const remaining = totalLength - d, spiral = spiralDisplacement(remaining, radius, Ls)
    x = T * (1 + Math.cos(deltaRad)) - spiral.x * Math.cos(deltaRad) - spiral.y * Math.sin(deltaRad)
    y = T * Math.sin(deltaRad) - spiral.x * Math.sin(deltaRad) + spiral.y * Math.cos(deltaRad)
    tangentAngle = deltaRad - spiral.theta; segment = 'exit-spiral'
  }
  y *= turn
  const bearing = (approachBearingDeg % 360) * DEG
  const point = tsCoord ? localToWorld(tsCoord, x, y, bearing) : { easting: x, northing: y }
  const tangentBearingDeg = (((approachBearingDeg % 360) + turn * tangentAngle / DEG) % 360 + 360) % 360
  const chainage = tsChainage + d
  if (![point.easting, point.northing, x, y, chainage, tangentBearingDeg].every(Number.isFinite)) throw new RangeError('Alignment coordinates exceed the finite calculation range.')
  return { chainage, distanceFromTS: d, ...point, offset: y, segment,
    deflectionDeg: Math.atan2(y, x) / DEG, tangentBearingDeg }
}

/** Bounded regular sampling, always retaining the exact TS/SC/CS/ST boundaries. */
export function stationSpiralAlignment(alignment: SpiralAlignmentResult, interval = 10): AlignmentStation[] {
  if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Station interval must be finite and positive.')
  const count = Math.floor(alignment.totalLength / interval)
  if (!Number.isSafeInteger(count) || count + 5 > MAX_STATIONS) throw new RangeError(`Use a larger station interval; at most ${MAX_STATIONS} stations are supported.`)
  const length = alignment.totalLength
  const distances = new Set([0, alignment.input.spiralLength, alignment.input.spiralLength + alignment.Lc, length])
  for (let i = 1; i <= count; i++) if (i * interval <= length) distances.add(i * interval)
  return [...distances].sort((a, b) => a - b).map(distance => {
    const station = stationAtDistance(alignment, distance)
    if (!station) throw new RangeError('Unable to sample an alignment station.')
    return station
  })
}

// ─── OpenLayers Geometry Helper ─────────────────────────────────────────────

/**
 * Produce a coordinate array for use with OpenLayers `LineString` or any
 * other rendering layer that expects [easting, northing] pairs.
 *
 * If the alignment was computed without PI coordinates, returns local-frame
 * coordinates (TS at origin, approach tangent along +X). Otherwise returns
 * world coordinates.
 */
export function alignmentToCoordinateArray(
  alignment: SpiralAlignmentResult,
  interval: number = 2
): Array<[number, number]> {
  const stations = stationSpiralAlignment(alignment, interval)
  return stations.map(s => [s.easting, s.northing])
}

/**
 * Convert stations to CSV for export.
 */
export function spiralAlignmentToCSV(stations: AlignmentStation[]): string {
  const header = 'Chainage_m,Distance_from_TS_m,Easting_m,Northing_m,Offset_m,Segment,Deflection_deg'
  const rows = stations.map(s =>
    [
      s.chainage.toFixed(3),
      s.distanceFromTS.toFixed(3),
      s.easting.toFixed(3),
      s.northing.toFixed(3),
      s.offset.toFixed(3),
      s.segment,
      s.deflectionDeg.toFixed(4),
    ].join(',')
  )
  return [header, ...rows].join('\n')
}
