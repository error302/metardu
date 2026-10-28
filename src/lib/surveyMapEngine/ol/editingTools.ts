/**
 * Editing Tools — real geometry operations for Split, Merge, Reshape, Rotate, Offset
 *
 * Splitting retains the actual cut path through the shared planar partitioner;
 * merge and validity operations use Turf on declared project-grid coordinates.
 * Grid areas use the shared project-CRS authority, and offsets use projected
 * metres. The useDigitizingTools hook calls these from OL drawend and Apply.
 *
 * T0.6 FIX (2026-07-09): The floating DigitizingToolbar.tsx that previously
 * called these has been deleted (it was dead code — zero importers). The
 * live UI is now MapToolDock.tsx's "Advanced" section, which routes through
 * MapClient's useDigitizingTools hook.
 */

import { logger } from '@/lib/logger'
import * as turf from '@turf/turf'
import type { Feature, Polygon as GeoPolygon } from 'geojson'
import { assertProjectedCrs, surveyArea } from '@/lib/spatial/projectCrs'
import { splitSimpleParcel } from '../core/parcelSplit'

export interface SplitResult {
  polygon1: [number, number][]
  polygon2: [number, number][]
  area1: number
  area2: number
}

/**
 * Split a polygon with a line in a declared projected project grid.
 * Returns the two resulting polygons and their grid areas in square metres.
 */
export function splitPolygonWithLine(
  polygonCoords: [number, number][],
  lineCoords: [number, number][],
  projectCrs: string,
): SplitResult | null {
  try {
    return splitSimpleParcel(polygonCoords, lineCoords, projectCrs)
  } catch (err) {
    logger.error('[editingTools] splitPolygonWithLine failed:', { error: err })
    return null
  }
}

/**
 * Merge two or more polygons into one using turf.union.
 */
export function mergePolygons(
  polygons: [number, number][][],
): [number, number][] | null {
  if (polygons.length < 2) return null

  try {
    let result = turf.polygon([ensureClosed(polygons[0])]) as Feature<GeoPolygon>

    for (let i = 1; i < polygons.length; i++) {
      const next = turf.polygon([ensureClosed(polygons[i])])
      const union = turf.union(turf.featureCollection([result, next]))
      if (union && union.geometry?.type === 'Polygon') {
        result = turf.polygon((union.geometry as GeoPolygon).coordinates) as Feature<GeoPolygon>
      } else if (union && union.geometry?.type === 'MultiPolygon') {
        return null
      }
    }

    return (result.geometry as GeoPolygon).coordinates[0] as [number, number][]
  } catch (err) {
    logger.error('[editingTools] mergePolygons failed:', { error: err })
    return null
  }
}

/**
 * Rotate a polygon around its centroid by a given angle (degrees).
 *
 * T0.2 FIX (2026-07-09): Previously delegated to turf.transformRotate, which
 * throws "coordinates must contain numbers" on certain polygon shapes (e.g.
 * L-shapes, concave rings) — the silent catch returned the input unchanged,
 * meaning rotation quietly no-op'd for anything but simple squares. The
 * hardcoded `15` in the old MapClient handler hid this bug for months.
 *
 * Now we do the 2D rotation manually: compute the centroid, then apply the
 * standard rotation matrix to each vertex. This is O(n), CRS-agnostic, and
 * has no turf dependency.
 */
export function rotatePolygon(
  coords: [number, number][],
  angleDeg: number,
  origin?: [number, number],
): [number, number][] {
  if (coords.length === 0) return coords
  try {
    const closed = ensureClosed(coords)
    let cx = origin?.[0] ?? 0
    let cy = origin?.[1] ?? 0
    if (!origin) {
      const n = closed.length - 1
      for (let i = 0; i < n; i++) {
        cx += closed[i][0]
        cy += closed[i][1]
      }
      cx /= n
      cy /= n
    }

    const rad = (angleDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const rotated: [number, number][] = closed.map(([x, y]) => [
      cx + (x - cx) * cos - (y - cy) * sin,
      cy + (x - cx) * sin + (y - cy) * cos,
    ])
    return rotated
  } catch (err) {
    logger.error('[editingTools] rotatePolygon failed:', { error: err })
    return coords
  }
}

/**
 * Create a parallel offset of a line or polygon boundary.
 * Uses planar grid coordinates in a declared projected CRS whose linear unit
 * is metres. Positive line offsets are left of the digitised direction;
 * positive polygon offsets expand outwards.
 */
export function createOffset(
  coords: [number, number][],
  distance: number,
  isPolygon: boolean,
  projectCrs: string,
): [number, number][] | null {
  try {
    assertProjectedCrs(projectCrs)
    if (!Number.isFinite(distance) || distance === 0) return null
    if (coords.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null

    if (!isPolygon) return offsetOpenLine(coords, distance)

    const closed = ensureClosed(coords)
    const openRing = stripClosingCoordinate(closed)
    if (openRing.length < 3) return null
    const orientation = Math.sign(signedRingArea(openRing))
    if (orientation === 0) return null

    // Positive polygon offsets expand outward; negative offsets move inward.
    // Coordinates and distance are in the declared projected project grid,
    // so this is planar metric work rather than a geographic Turf buffer.
    const signedDistance = distance * -orientation
    const shifted = offsetClosedRing(openRing, signedDistance)
    if (!shifted || shifted.length < 4) return null
    const originalArea = surveyArea(closed, projectCrs)
    const shiftedArea = surveyArea(shifted, projectCrs)
    const areaTolerance = Math.max(1e-8, originalArea * 1e-12)
    if (distance > 0 ? shiftedArea <= originalArea + areaTolerance : shiftedArea >= originalArea - areaTolerance) return null

    const shiftedPolygon = turf.polygon([shifted])
    if (!turf.booleanValid(shiftedPolygon)) return null
    if (Math.sign(signedRingArea(shifted)) !== orientation) return null
    return shifted
  } catch (err) {
    logger.error('[editingTools] createOffset failed:', { error: err })
  }
  return null
}

/**
 * Reshape: replace part of a polygon boundary with a new line segment.
 */
export function reshapePolygon(
  polygonCoords: [number, number][],
  newSegmentCoords: [number, number][],
  projectCrs: string,
): [number, number][] | null {
  try {
    assertProjectedCrs(projectCrs)
    const closed = ensureClosed(polygonCoords)
    const newLine = turf.lineString(newSegmentCoords)
    const polyBoundary = turf.lineString(closed)
    const ixns = turf.lineIntersect(newLine, polyBoundary)

    if (ixns.features.length < 2) {
      const splitResult = splitPolygonWithLine(closed, newSegmentCoords, projectCrs)
      if (!splitResult) return null
      const area0 = surveyArea(splitResult.polygon1, projectCrs)
      const area1 = surveyArea(splitResult.polygon2, projectCrs)
      return area0 > area1 ? splitResult.polygon1 : splitResult.polygon2
    }

    const pt0 = ixns.features[0].geometry.coordinates as [number, number]
    const pt1 = ixns.features[1].geometry.coordinates as [number, number]

    let idx0 = 0
    let idx1 = 0
    let minD0 = Infinity
    let minD1 = Infinity

    for (let i = 0; i < closed.length; i++) {
      const d0 = squaredDistance(closed[i], pt0)
      const d1 = squaredDistance(closed[i], pt1)
      if (d0 < minD0) { minD0 = d0; idx0 = i }
      if (d1 < minD1) { minD1 = d1; idx1 = i }
    }

    const result: [number, number][] = []
    const start = Math.min(idx0, idx1)
    const end = Math.max(idx0, idx1)

    for (let i = 0; i <= start; i++) {
      result.push([...closed[i]])
    }
    for (const pt of newSegmentCoords) {
      result.push([...pt])
    }
    for (let i = end; i < closed.length; i++) {
      result.push([...closed[i]])
    }

    const reshaped = ensureClosed(result)
    if (reshaped.length < 4 || !turf.booleanValid(turf.polygon([reshaped]))) return null
    if (surveyArea(reshaped, projectCrs) <= 0) return null
    return reshaped
  } catch {
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripClosingCoordinate(coords: [number, number][]): [number, number][] {
  return isClosed(coords) ? coords.slice(0, -1) : coords.slice()
}

function signedRingArea(coords: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < coords.length; i++) {
    const next = coords[(i + 1) % coords.length]
    sum += coords[i][0] * next[1] - next[0] * coords[i][1]
  }
  return sum / 2
}

function leftNormal(a: [number, number], b: [number, number]): [number, number] | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = Math.hypot(dx, dy)
  return length === 0 ? null : [-dy / length, dx / length]
}

function offsetSegment(
  a: [number, number],
  b: [number, number],
  distance: number,
): [[number, number], [number, number]] | null {
  const normal = leftNormal(a, b)
  if (!normal) return null
  const dx = normal[0] * distance
  const dy = normal[1] * distance
  return [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy]]
}

function intersectOffsetSegments(
  previous: [[number, number], [number, number]],
  next: [[number, number], [number, number]],
  originalVertex: [number, number],
  distance: number,
): [number, number] | null {
  const [p, pEnd] = previous
  const [q, qEnd] = next
  const rx = pEnd[0] - p[0]
  const ry = pEnd[1] - p[1]
  const sx = qEnd[0] - q[0]
  const sy = qEnd[1] - q[1]
  const denominator = rx * sy - ry * sx
  const rLength = Math.hypot(rx, ry)
  const sLength = Math.hypot(sx, sy)

  if (Math.abs(denominator) <= Math.max(1e-12, rLength * sLength * 1e-12)) {
    // Parallel segments share an offset line unless they reverse direction.
    if (rx * sx + ry * sy <= 0) return null
    return [(pEnd[0] + q[0]) / 2, (pEnd[1] + q[1]) / 2]
  }

  const qpx = q[0] - p[0]
  const qpy = q[1] - p[1]
  const t = (qpx * sy - qpy * sx) / denominator
  const intersection: [number, number] = [p[0] + t * rx, p[1] + t * ry]
  const miterLength = Math.hypot(intersection[0] - originalVertex[0], intersection[1] - originalVertex[1])
  if (!Number.isFinite(miterLength) || miterLength > Math.max(Math.abs(distance) * 20, 1e-6)) return null
  return intersection
}

function offsetOpenLine(coords: [number, number][], distance: number): [number, number][] | null {
  const points = coords.filter((point, index) => index === 0 || point[0] !== coords[index - 1][0] || point[1] !== coords[index - 1][1])
  if (points.length < 2) return null
  const segments: Array<[[number, number], [number, number]]> = []
  for (let i = 0; i < points.length - 1; i++) {
    const segment = offsetSegment(points[i], points[i + 1], distance)
    if (!segment) return null
    segments.push(segment)
  }

  const result: [number, number][] = [segments[0][0]]
  for (let i = 1; i < points.length - 1; i++) {
    const corner = intersectOffsetSegments(segments[i - 1], segments[i], points[i], distance)
    if (!corner) return null
    result.push(corner)
  }
  result.push(segments[segments.length - 1][1])
  return result.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ? result : null
}

function offsetClosedRing(points: [number, number][], distance: number): [number, number][] | null {
  if (points.length < 3) return null
  const segments: Array<[[number, number], [number, number]]> = []
  for (let i = 0; i < points.length; i++) {
    const segment = offsetSegment(points[i], points[(i + 1) % points.length], distance)
    if (!segment) return null
    segments.push(segment)
  }

  const result: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    const previous = segments[(i + points.length - 1) % points.length]
    const next = segments[i]
    const corner = intersectOffsetSegments(previous, next, points[i], distance)
    if (!corner) return null
    result.push(corner)
  }
  if (!result.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return null
  result.push([...result[0]])
  return result
}

function isClosed(coords: [number, number][]): boolean {
  if (coords.length < 2) return false
  const first = coords[0]
  const last = coords[coords.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}

function ensureClosed(coords: [number, number][]): [number, number][] {
  if (isClosed(coords)) return coords
  return [...coords, coords[0]]
}

function squaredDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}
