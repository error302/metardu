/**
 * Editing Tools — real geometry operations for Split, Merge, Reshape, Rotate, Offset
 *
 * Uses turf.js for the actual math. Each function takes OL features and returns
 * new OL features (or modifies in place). The DigitizingToolbar calls these via
 * useMapInteractions.
 */

import * as turf from '@turf/turf'
import type { Feature, Polygon as GeoPolygon, MultiPolygon } from 'geojson'

export interface SplitResult {
  polygon1: [number, number][]
  polygon2: [number, number][]
  area1: number
  area2: number
}

/**
 * Split a polygon with a line.
 * Uses turf.lineIntersect + turf.polygonToLine + boolean operations.
 * Returns the two resulting polygons.
 */
export function splitPolygonWithLine(
  polygonCoords: [number, number][],
  lineCoords: [number, number][],
): SplitResult | null {
  try {
    // Ensure closed ring
    const closed = isClosed(polygonCoords) ? polygonCoords : [...polygonCoords, polygonCoords[0]]

    const polygon = turf.polygon([closed.map(([e, n]) => [e, n])])
    const line = turf.lineString(lineCoords.map(([e, n]) => [e, n]))

    // Check if line actually intersects the polygon
    const intersects = turf.lineIntersect(line, polygon)
    if (intersects.features.length < 2) {
      return null // Line must cross the polygon at least twice
    }

    // Split using turf: create a bbox of the polygon, then use the line to cut
    // This is a simplified approach — true polygon splitting is complex.
    // We use the line to create two half-planes and intersect each with the polygon.

    // Get the intersection points
    const intersectionPoints = intersects.features.map(f => {
      const coords = f.geometry.coordinates as [number, number]
      return coords
    })

    if (intersectionPoints.length < 2) return null

    // Create two polygons: one on each side of the line
    // Extend the line far beyond the polygon bounds
    const bbox = turf.bbox(polygon)
    const width = bbox[2] - bbox[0]
    const height = bbox[3] - bbox[1]
    const margin = Math.max(width, height) * 2

    const lineStart = lineCoords[0] as [number, number]
    const lineEnd = lineCoords[lineCoords.length - 1] as [number, number]

    // Extend the line in both directions
    const dx = lineEnd[0] - lineStart[0]
    const dy = lineEnd[1] - lineStart[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return null

    const ux = dx / len
    const uy = dy / len

    const extendedStart: [number, number] = [
      lineStart[0] - ux * margin,
      lineStart[1] - uy * margin,
    ]
    const extendedEnd: [number, number] = [
      lineEnd[0] + ux * margin,
      lineEnd[1] + uy * margin,
    ]

    // Create a cutting polygon (a thin sliver rectangle along the extended line).
    // The sliver must be thin enough to NOT contain the polygon (otherwise
    // turf.difference returns null), but thick enough that turf treats it as
    // a valid 2D area. 0.001m (1mm) is well below surveying tolerance.
    const perpX = -uy
    const perpY = ux
    const halfWidth = 0.001

    const cutPolygon = turf.polygon([[
      [extendedStart[0] + perpX * halfWidth, extendedStart[1] + perpY * halfWidth],
      [extendedEnd[0] + perpX * halfWidth, extendedEnd[1] + perpY * halfWidth],
      [extendedEnd[0] - perpX * halfWidth, extendedEnd[1] - perpY * halfWidth],
      [extendedStart[0] - perpX * halfWidth, extendedStart[1] - perpY * halfWidth],
      [extendedStart[0] + perpX * halfWidth, extendedStart[1] + perpY * halfWidth],
    ]])

    // Split: difference gives us two separate pieces
    const diff = turf.difference(turf.featureCollection([polygon, cutPolygon]))

    if (!diff || !diff.geometry) return null

    // turf.difference returns a Feature (Polygon or MultiPolygon)
    const diffGeom = diff.geometry
    if (diffGeom.type === 'Polygon') {
      // Single polygon — can't split into two
      return null
    }
    if (diffGeom.type === 'MultiPolygon') {
      const polys = diffGeom.coordinates as number[][][][]
      if (polys.length < 2) return null
      const p1Coords = polys[0][0] as [number, number][]
      const p2Coords = polys[1][0] as [number, number][]

      return {
        polygon1: p1Coords,
        polygon2: p2Coords,
        area1: turf.area(turf.polygon([p1Coords])),
        area2: turf.area(turf.polygon([p2Coords])),
      }
    }

    return null
  } catch (err) {
    console.error('[editingTools] splitPolygonWithLine failed:', err)
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
        // Can't merge non-adjacent polygons — return null
        return null
      }
    }

    return (result.geometry as GeoPolygon).coordinates[0] as [number, number][]
  } catch (err) {
    console.error('[editingTools] mergePolygons failed:', err)
    return null
  }
}

/**
 * Rotate a polygon around its centroid by a given angle (degrees).
 */
export function rotatePolygon(
  coords: [number, number][],
  angleDeg: number,
): [number, number][] {
  try {
    const closed = ensureClosed(coords)
    const polygon = turf.polygon([closed])
    const rotated = turf.transformRotate(polygon, angleDeg)
    return (rotated.geometry as GeoPolygon).coordinates[0] as [number, number][]
  } catch {
    return coords
  }
}

/**
 * Create a parallel offset of a line or polygon boundary.
 * Uses turf.lineOffset for lines, or buffers for polygons.
 *
 * @param coords Line or polygon coordinates
 * @param distance Offset distance in metres (positive = right, negative = left)
 * @param isPolygon Whether coords represent a polygon boundary
 */
export function createOffset(
  coords: [number, number][],
  distance: number,
  isPolygon: boolean = false,
): [number, number][] | null {
  try {
    const closed = ensureClosed(coords)

    if (isPolygon) {
      // For polygons, use buffer to create an offset boundary
      const polygon = turf.polygon([closed])
      const buffered = turf.buffer(polygon, distance, { units: 'meters' })
      if (buffered?.geometry?.type === 'Polygon') {
        return (buffered.geometry as GeoPolygon).coordinates[0] as [number, number][]
      }
    } else {
      // For lines, use lineOffset
      const line = turf.lineString(closed)
      const offset = turf.lineOffset(line, distance, { units: 'meters' })
      return offset.geometry.coordinates as [number, number][]
    }
  } catch (err) {
    console.error('[editingTools] createOffset failed:', err)
  }
  return null
}

/**
 * Reshape: replace part of a polygon boundary with a new line segment.
 * Finds where the new line intersects the existing boundary and replaces
 * the boundary between those intersection points.
 */
export function reshapePolygon(
  polygonCoords: [number, number][],
  newSegmentCoords: [number, number][],
): [number, number][] | null {
  try {
    const closed = ensureClosed(polygonCoords)
    const polygon = turf.polygon([closed])

    // Find intersection points between new line and polygon boundary
    const newLine = turf.lineString(newSegmentCoords)
    // turf.lineIntersect works line→polygon boundary
    const polyBoundary = turf.lineString(closed)
    const ixns = turf.lineIntersect(newLine, polyBoundary)

    if (ixns.features.length < 2) {
      // Fallback: split polygon with the drawn line and take the larger half
      const splitLine = turf.lineString(newSegmentCoords)
      try {
        const splitResult = splitPolygonWithLine(closed, newSegmentCoords)
        if (!splitResult) return null
        const area0 = turf.area(turf.polygon([ensureClosed(splitResult.polygon1)])) ?? 0
        const area1 = turf.area(turf.polygon([ensureClosed(splitResult.polygon2)])) ?? 0
        return area0 > area1 ? splitResult.polygon1 : splitResult.polygon2
      } catch {
        return null
      }
    }

    // Proper reshaping: swap the segment between the two intersection points
    const pt0 = ixns.features[0].geometry.coordinates as [number, number]
    const pt1 = ixns.features[1].geometry.coordinates as [number, number]

    // Find nearest vertices on boundary ring for the two intersection points
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

    // Build new ring: vertices from idx0 up to idx1 replaced by the newSegment
    const result: [number, number][] = []
    const start = Math.min(idx0, idx1)
    const end = Math.max(idx0, idx1)

    for (let i = 0; i <= start; i++) {
      result.push([...closed[i]])
    }
    // Insert the new segment
    for (const pt of newSegmentCoords) {
      result.push([...pt])
    }
    for (let i = end; i < closed.length; i++) {
      result.push([...closed[i]])
    }

    return result
  } catch {
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
