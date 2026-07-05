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

    // Create a cutting polygon (a thin rectangle along the extended line)
    // AUDIT FIX (2026-07-05): halfWidth was `margin` (= 2x bbox dimension)
    // which made the cutting polygon so wide it swallowed the entire target
    // polygon, causing turf.difference to return nothing. Now uses a tiny
    // halfWidth (0.01m) — just enough for turf to register a valid polygon
    // but thin enough to only cut along the line.
    const perpX = -uy
    const perpY = ux
    const halfWidth = 0.01

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
 * the boundary between those intersection points with the new line.
 *
 * AUDIT FIX (2026-07-05): Properly implemented. Was previously returning
 * the original polygon unchanged (no-op). Now traces the boundary, finds
 * intersection points, and replaces the segment between them.
 */
export function reshapePolygon(
  polygonCoords: [number, number][],
  newSegmentCoords: [number, number][],
): [number, number][] | null {
  try {
    const closed = ensureClosed(polygonCoords)
    const polygon = turf.polygon([closed])
    const newLine = turf.lineString(newSegmentCoords)

    // Find intersection points between the new line and the polygon boundary
    const intersects = turf.lineIntersect(newLine, polygon)
    if (intersects.features.length < 2) {
      return null // Line must cross the polygon boundary at 2+ points
    }

    // Get first and last intersection points
    const ip1 = intersects.features[0].geometry.coordinates as [number, number]
    const ip2 = intersects.features[intersects.features.length - 1].geometry.coordinates as [number, number]

    // Find which boundary segment each intersection point falls on
    const boundary = closed.slice(0, -1) // remove closing point
    const seg1 = findSegmentIndex(boundary, ip1)
    const seg2 = findSegmentIndex(boundary, ip2)

    if (seg1 === -1 || seg2 === -1) return null
    if (seg1 === seg2) return null // intersection points on same segment — degenerate

    // Build the new ring by walking the boundary from ip2 forward to ip1,
    // then back from ip1 to ip2 via the new segment.
    // This replaces the boundary section between ip2→ip1 with the new line.
    const newRing: [number, number][] = []

    // Start at ip2
    newRing.push(ip2)

    // Walk forward along the boundary from seg2+1 to seg1
    let i = (seg2 + 1) % boundary.length
    let safety = 0
    while (i !== seg1 && safety < boundary.length * 2) {
      newRing.push(boundary[i])
      i = (i + 1) % boundary.length
      safety++
    }
    if (safety >= boundary.length * 2) return null // safety check

    // Add ip1
    newRing.push(ip1)

    // Add the new segment in reverse (from ip1 back to ip2 via the new line)
    // The new segment was drawn from start to end; we need it from ip1 to ip2
    // Since ip1 is near the start and ip2 is near the end of the new segment,
    // we add the new segment coordinates in reverse order
    for (let j = newSegmentCoords.length - 1; j >= 0; j--) {
      // Skip if this point is essentially the same as the last added point
      const last = newRing[newRing.length - 1]
      if (Math.abs(newSegmentCoords[j][0] - last[0]) < 1e-9 &&
          Math.abs(newSegmentCoords[j][1] - last[1]) < 1e-9) continue
      newRing.push(newSegmentCoords[j])
    }

    // Close the ring
    newRing.push(ip2)

    // Validate: the new polygon must have a positive area and be valid
    const newPolygon = turf.polygon([newRing])
    const newArea = turf.area(newPolygon)
    if (newArea < 0.001) return null

    return newRing
  } catch (err) {
    console.error('[editingTools] reshapePolygon failed:', err)
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the index of the boundary segment closest to a point.
 * Returns the segment index (0-based) or -1 if not found.
 */
function findSegmentIndex(boundary: [number, number][], point: [number, number]): number {
  let minDist = Infinity
  let bestSeg = -1
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    const dist = pointToSegmentDistance(point, a, b)
    if (dist < minDist) {
      minDist = dist
      bestSeg = i
    }
  }
  return bestSeg
}

/**
 * Distance from a point to a line segment.
 */
function pointToSegmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  return Math.hypot(p[0] - projX, p[1] - projY)
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
