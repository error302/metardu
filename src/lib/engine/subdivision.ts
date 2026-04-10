/**
 * METARDU Subdivision Engine
 *
 * Algorithms for splitting a parent parcel polygon into smaller child lots.
 *
 * Methods:
 *  - single-split: Cut polygon by a user-drawn line into two pieces
 *  - grid: Divide polygon bounding box into a grid, clip each cell
 *  - radial: Create triangular sectors from a center point to boundary
 *  - area: Iteratively cut lots of approximately equal target area
 *
 * Calculation standard: N.N. Basak — Surveying and Levelling
 * - No intermediate rounding
 * - Full floating point precision throughout
 * - Round only at final display layer
 * - Bearings: WCB 0-360° clockwise from North
 * - Coordinates: EPSG:21037 (Kenya Arc 1960 / UTM 37S), meters
 */

import { Point2D } from './types'
import { coordinateArea } from './area'
import { lineIntersection, pointInPolygon } from './geometry'
import { toRadians, normalizeBearing } from './angles'
import type {
  SubdivisionMethod,
  SubdivisionParams,
  SubdivisionResult,
  SubdividedLot,
  SplitLine,
} from '@/types/subdivision'

// ─── Utility helpers ────────────────────────────────────────────────────────

/** Compute the signed area of a polygon (positive = CCW). */
function signedArea(pts: Point2D[]): number {
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].easting * pts[j].northing
    area -= pts[j].easting * pts[i].northing
  }
  return area / 2
}

/** Compute centroid using the area-weighted formula. */
function polyCentroid(pts: Point2D[]): Point2D {
  const open = stripClosing(pts)
  const n = open.length
  if (n === 0) return { easting: 0, northing: 0 }
  if (n === 1) return { ...open[0] }
  if (n === 2) return {
    easting: (open[0].easting + open[1].easting) / 2,
    northing: (open[0].northing + open[1].northing) / 2,
  }

  const closed = [...open, open[0]]
  let cx = 0, cy = 0, a = 0

  for (let i = 0; i < closed.length - 1; i++) {
    const cross =
      closed[i].easting * closed[i + 1].northing -
      closed[i + 1].easting * closed[i].northing
    cx += (closed[i].easting + closed[i + 1].easting) * cross
    cy += (closed[i].northing + closed[i + 1].northing) * cross
    a += cross
  }
  a /= 2

  if (Math.abs(a) > 1e-12) {
    cx /= (6 * a)
    cy /= (6 * a)
  } else {
    cx = open.reduce((s, p) => s + p.easting, 0) / n
    cy = open.reduce((s, p) => s + p.northing, 0) / n
  }

  return { easting: cx, northing: cy }
}

/** Ensure polygon is explicitly closed (first = last). */
function ensureClosed(pts: Point2D[]): Point2D[] {
  if (pts.length < 3) return [...pts]
  const dE = pts[0].easting - pts[pts.length - 1].easting
  const dN = pts[0].northing - pts[pts.length - 1].northing
  if (Math.sqrt(dE * dE + dN * dN) < 1e-10) return [...pts]
  return [...pts, { ...pts[0] }]
}

/** Strip the repeated closing vertex if present. */
function stripClosing(pts: Point2D[]): Point2D[] {
  if (pts.length < 3) return [...pts]
  const dE = pts[0].easting - pts[pts.length - 1].easting
  const dN = pts[0].northing - pts[pts.length - 1].northing
  if (Math.sqrt(dE * dE + dN * dN) < 1e-10) return pts.slice(0, -1)
  return [...pts]
}

/** Compute polygon perimeter. */
function perimeter(pts: Point2D[]): number {
  const closed = ensureClosed(pts)
  let p = 0
  for (let i = 0; i < closed.length - 1; i++) {
    const dx = closed[i + 1].easting - closed[i].easting
    const dy = closed[i + 1].northing - closed[i].northing
    p += Math.sqrt(dx * dx + dy * dy)
  }
  return p
}

/** Compute area in hectares from vertices. */
function areaHa(pts: Point2D[]): number {
  return coordinateArea(pts).areaHa
}

/**
 * Determine which side of a directed line a point falls on.
 * Returns >0 for left, <0 for right, 0 for on the line.
 * "Left" is the side to your left when walking from p1 to p2.
 */
function sideOfLine(
  point: Point2D,
  lineP1: Point2D,
  lineP2: Point2D
): number {
  return (
    (lineP2.easting - lineP1.easting) * (point.northing - lineP1.northing) -
    (lineP2.northing - lineP1.northing) * (point.easting - lineP1.easting)
  )
}

/**
 * Find intersections of a line (defined by two points) with polygon edges.
 * Returns intersection points and the edge index + parametric t for each.
 */
function findLinePolygonIntersections(
  lineP1: Point2D,
  lineP2: Point2D,
  polygon: Point2D[]
): Array<{ point: Point2D; edgeIdx: number; t: number }> {
  const result: Array<{ point: Point2D; edgeIdx: number; t: number }> = []
  const n = polygon.length
  const seen = new Set<string>()

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const inter = lineIntersection(lineP1, lineP2, polygon[i], polygon[j])
    if (inter.ok && inter.value.withinSegmentB) {
      const pt = inter.value.point
      const key = `${pt.easting.toFixed(6)},${pt.northing.toFixed(6)}`
      if (!seen.has(key)) {
        seen.add(key)
        // t is the parametric position along the polygon edge (0=edge start, 1=edge end)
        const dx = polygon[j].easting - polygon[i].easting
        const dy = polygon[j].northing - polygon[i].northing
        const lenSq = dx * dx + dy * dy
        const t = lenSq > 1e-20
          ? ((pt.easting - polygon[i].easting) * dx + (pt.northing - polygon[i].northing) * dy) / lenSq
          : 0
        result.push({ point: pt, edgeIdx: i, t })
      }
    }
  }

  return result
}

/**
 * Split a simple polygon into two pieces using a line.
 *
 * Algorithm:
 * 1. Find all intersections of the line with polygon edges
 * 2. Sort by parametric position along the polygon boundary
 * 3. Take the first two intersections
 * 4. Build polygon A by walking the boundary from intersection 1 to intersection 2,
 *    then adding intersection 2 → intersection 1 along the split line
 * 5. Build polygon B by walking from intersection 2 to intersection 1,
 *    then adding intersection 1 → intersection 2 along the split line
 */
function splitPolygonByLine(
  polygon: Point2D[],
  lineP1: Point2D,
  lineP2: Point2D
): Point2D[][] {
  const open = stripClosing(polygon)
  const n = open.length
  if (n < 3) return [polygon]

  const intersections = findLinePolygonIntersections(lineP1, lineP2, open)

  if (intersections.length < 2) {
    return [polygon]
  }

  // Sort intersections by (edgeIdx, t) to get their order along the polygon boundary
  intersections.sort((a, b) => {
    if (a.edgeIdx !== b.edgeIdx) return a.edgeIdx - b.edgeIdx
    return a.t - b.t
  })

  const ip1 = intersections[0] // first intersection along boundary
  const ip2 = intersections[1] // second intersection along boundary

  // Build polygon A: walk from ip1 to ip2 along boundary, then back along split line
  const polyA: Point2D[] = [ip1.point]
  let idx = ip1.edgeIdx
  let tCurrent = ip1.t

  // Walk along boundary edges
  while (true) {
    const j = (idx + 1) % n
    if (idx === ip2.edgeIdx) {
      // Same edge as ip2 — add ip2
      polyA.push(ip2.point)
      break
    }
    // Add the end vertex of this edge
    polyA.push(open[j])
    idx = j
    tCurrent = 0
    // Safety: if we've gone all the way around
    if (polyA.length > n + 5) break
  }

  // Build polygon B: walk from ip2 to ip1 along boundary, then back along split line
  const polyB: Point2D[] = [ip2.point]
  idx = ip2.edgeIdx
  tCurrent = ip2.t

  while (true) {
    const j = (idx + 1) % n
    if (idx === ip1.edgeIdx) {
      polyB.push(ip1.point)
      break
    }
    polyB.push(open[j])
    idx = j
    tCurrent = 0
    if (polyB.length > n + 5) break
  }

  // Check that both polygons are valid (positive area)
  const areaA = Math.abs(signedArea(polyA))
  const areaB = Math.abs(signedArea(polyB))
  const minArea = 0.5 // 0.5 sqm minimum

  const results: Point2D[][] = []
  if (areaA > minArea && polyA.length >= 3) results.push(polyA)
  if (areaB > minArea && polyB.length >= 3) results.push(polyB)

  return results.length >= 2 ? results : [polygon]
}

/** Check if a polygon is valid (enough vertices, positive area). */
function isValidPolygon(pts: Point2D[]): boolean {
  if (pts.length < 3) return false
  return Math.abs(signedArea(pts)) > 1e-6
}

// ─── Sutherland-Hodgman polygon clipping ────────────────────────────────────

/**
 * Clip polygon to a convex clip boundary using Sutherland-Hodgman.
 * The clipBoundary must be wound CCW so that "inside" (left of each edge)
 * matches the `sideOfLine >= 0` test.
 */
function clipPolygonByBoundary(
  polygon: Point2D[],
  clipBoundary: Point2D[]
): Point2D[] {
  let output = [...polygon]
  const m = clipBoundary.length

  for (let i = 0; i < m && output.length > 0; i++) {
    const edgeStart = clipBoundary[i]
    const edgeEnd = clipBoundary[(i + 1) % m]
    output = clipEdge(output, edgeStart, edgeEnd)
  }

  return output
}

/**
 * Clip a polygon against a single half-plane defined by the line
 * edgeStart→edgeEnd. "Inside" = left side of the directed edge (sideOfLine >= 0).
 */
function clipEdge(
  polygon: Point2D[],
  edgeStart: Point2D,
  edgeEnd: Point2D
): Point2D[] {
  if (polygon.length === 0) return []

  const result: Point2D[] = []

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]
    const previous = polygon[(i + polygon.length - 1) % polygon.length]

    const currInside = sideOfLine(current, edgeStart, edgeEnd) >= -1e-10
    const prevInside = sideOfLine(previous, edgeStart, edgeEnd) >= -1e-10

    if (currInside) {
      if (!prevInside) {
        const inter = segIntersection(previous, current, edgeStart, edgeEnd)
        if (inter) result.push(inter)
      }
      result.push(current)
    } else if (prevInside) {
      const inter = segIntersection(previous, current, edgeStart, edgeEnd)
      if (inter) result.push(inter)
    }
  }

  return result
}

/** Line-segment intersection (returns point or null). */
function segIntersection(
  p1: Point2D, p2: Point2D,
  p3: Point2D, p4: Point2D
): Point2D | null {
  const result = lineIntersection(p1, p2, p3, p4)
  if (!result.ok) return null
  return result.value.point
}

// ─── Closest-point helpers ─────────────────────────────────────────────────

function closestPointOnPolygonBoundary(
  polygon: Point2D[],
  target: Point2D
): Point2D {
  const n = polygon.length
  let minDist = Infinity
  let closest: Point2D = polygon[0]

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const pt = closestPointOnSegment(polygon[i], polygon[j], target)
    const dx = pt.easting - target.easting
    const dy = pt.northing - target.northing
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      closest = pt
    }
  }

  return closest
}

function closestPointOnSegment(
  a: Point2D,
  b: Point2D,
  p: Point2D
): Point2D {
  const dx = b.easting - a.easting
  const dy = b.northing - a.northing
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-12) return { ...a }

  let t = ((p.easting - a.easting) * dx + (p.northing - a.northing) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return {
    easting: a.easting + t * dx,
    northing: a.northing + t * dy,
  }
}

function pickClosest(points: Point2D[], reference: Point2D): Point2D {
  let minDist = Infinity
  let closest = points[0]
  for (const pt of points) {
    const dx = pt.easting - reference.easting
    const dy = pt.northing - reference.northing
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      closest = pt
    }
  }
  return closest
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Subdivide a parent parcel polygon using the specified method and parameters.
 */
export function subdivide(
  parentVertices: Point2D[],
  method: SubdivisionMethod,
  params: SubdivisionParams
): SubdivisionResult {
  const parent = stripClosing(parentVertices)
  const parentArea = areaHa(parent)

  const result: SubdivisionResult = {
    method,
    parentParcel: {
      vertices: parent,
      areaHa: parentArea,
    },
    lots: [],
    totalAreaHa: 0,
    remainderAreaHa: 0,
  }

  let lots: SubdividedLot[]

  switch (method) {
    case 'single-split':
      lots = subdivideSingleSplit(parent, params.splitLine!)
      break
    case 'grid':
      lots = subdivideGrid(parent, params.rows ?? 2, params.cols ?? 2)
      break
    case 'radial':
      lots = subdivideRadial(parent, params.center, params.numLots ?? 4)
      break
    case 'area':
      lots = subdivideByArea(parent, params.targetArea ?? parentArea / 2, params.preferredBearing)
      break
    default:
      throw new Error(`Unknown subdivision method: ${method}`)
  }

  result.lots = lots
  result.totalAreaHa = lots.reduce((s, l) => s + l.areaHa, 0)
  result.remainderAreaHa = Math.max(0, parentArea - result.totalAreaHa)

  return result
}

// ─── Method 1: Single Split ─────────────────────────────────────────────────

function subdivideSingleSplit(
  polygon: Point2D[],
  splitLine: SplitLine
): SubdividedLot[] {
  if (!splitLine) return []

  const pieces = splitPolygonByLine(
    polygon,
    splitLine.startPoint,
    splitLine.endPoint
  )

  if (pieces.length < 2) {
    return [{
      lotNumber: 1,
      vertices: polygon,
      areaHa: areaHa(polygon),
      perimeter: perimeter(polygon),
      centroid: polyCentroid(polygon),
    }]
  }

  return pieces.map((piece, i) => ({
    lotNumber: i + 1,
    vertices: stripClosing(piece),
    areaHa: areaHa(piece),
    perimeter: perimeter(piece),
    centroid: polyCentroid(piece),
  }))
}

// ─── Method 2: Grid Subdivision ─────────────────────────────────────────────

function subdivideGrid(
  polygon: Point2D[],
  rows: number,
  cols: number
): SubdividedLot[] {
  if (rows < 1 || cols < 1) return []

  // Compute bounding box of the polygon
  let minE = Infinity, maxE = -Infinity
  let minN = Infinity, maxN = -Infinity

  for (const pt of polygon) {
    minE = Math.min(minE, pt.easting)
    maxE = Math.max(maxE, pt.easting)
    minN = Math.min(minN, pt.northing)
    maxN = Math.max(maxN, pt.northing)
  }

  const cellW = (maxE - minE) / cols
  const cellH = (maxN - minN) / rows

  const lots: SubdividedLot[] = []
  let lotNum = 1

  // Number lots left-to-right, top-to-bottom
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellMinE = minE + c * cellW
      const cellMaxE = minE + (c + 1) * cellW
      const cellMinN = minN + r * cellH
      const cellMaxN = minN + (r + 1) * cellH

      // Cell rectangle wound COUNTER-CLOCKWISE so that "inside" (left side of
      // each directed edge) matches the Sutherland-Hodgman clip test.
      // CCW: BL → BR → TR → TL
      const cellRect: Point2D[] = [
        { easting: cellMinE, northing: cellMinN }, // bottom-left
        { easting: cellMaxE, northing: cellMinN }, // bottom-right
        { easting: cellMaxE, northing: cellMaxN }, // top-right
        { easting: cellMinE, northing: cellMaxN }, // top-left
      ]

      // Clip polygon to the cell
      const clipped = clipPolygonByBoundary(polygon, cellRect)

      if (clipped.length >= 3 && isValidPolygon(clipped)) {
        const a = areaHa(clipped)
        // Skip tiny slivers (< 1 sqm)
        if (a * 10000 < 1) continue

        lots.push({
          lotNumber: lotNum++,
          vertices: stripClosing(clipped),
          areaHa: a,
          perimeter: perimeter(clipped),
          centroid: polyCentroid(clipped),
        })
      }
    }
  }

  return lots
}

// ─── Method 3: Radial Subdivision ───────────────────────────────────────────

function subdivideRadial(
  polygon: Point2D[],
  center: Point2D | undefined,
  numLots: number
): SubdividedLot[] {
  if (!center) {
    center = polyCentroid(polygon)
  }
  if (numLots < 2) return []

  // Project center onto polygon boundary if it's outside
  if (!pointInPolygon(center, polygon)) {
    center = closestPointOnPolygonBoundary(polygon, center)
  }

  // Create equal angular divisions
  const sectorAngle = (2 * Math.PI) / numLots
  const lots: SubdividedLot[] = []

  for (let s = 0; s < numLots; s++) {
    const startAngle = s * sectorAngle - Math.PI
    const endAngle = (s + 1) * sectorAngle - Math.PI

    // Find intersection points of the two radial lines with polygon boundary
    const farPoint1: Point2D = {
      easting: center.easting + 100000 * Math.sin(startAngle),
      northing: center.northing + 100000 * Math.cos(startAngle),
    }
    const farPoint2: Point2D = {
      easting: center.easting + 100000 * Math.sin(endAngle),
      northing: center.northing + 100000 * Math.cos(endAngle),
    }

    const startInters = findLinePolygonIntersections(center, farPoint1, polygon)
    const endInters = findLinePolygonIntersections(center, farPoint2, polygon)

    const startPt = startInters.length > 0
      ? pickClosest(startInters.map(i => i.point), center)
      : null
    const endPt = endInters.length > 0
      ? pickClosest(endInters.map(i => i.point), center)
      : null

    if (!startPt || !endPt) continue

    // Build sector polygon:
    // center → startPt → boundary walk → endPt → center
    const sectorVerts = buildSectorPolygon(polygon, center, startPt, endPt)

    if (sectorVerts.length >= 3) {
      const a = areaHa(sectorVerts)
      if (a * 10000 < 1) continue

      lots.push({
        lotNumber: s + 1,
        vertices: stripClosing(sectorVerts),
        areaHa: a,
        perimeter: perimeter(sectorVerts),
        centroid: polyCentroid(sectorVerts),
      })
    }
  }

  return lots
}

/**
 * Build a sector polygon by walking the boundary from startPt to endPt,
 * including the center point and both intersection points.
 */
function buildSectorPolygon(
  polygon: Point2D[],
  center: Point2D,
  startPt: Point2D,
  endPt: Point2D
): Point2D[] {
  const n = polygon.length
  const verts: Point2D[] = []

  // Find which edges the start and end intersection points lie on
  let startEdge = -1
  let endEdge = -1

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const closest = closestPointOnSegment(polygon[i], polygon[j], startPt)
    const dx = closest.easting - startPt.easting
    const dy = closest.northing - startPt.northing
    if (dx * dx + dy * dy < 1.0) {
      startEdge = i
      break
    }
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const closest = closestPointOnSegment(polygon[i], polygon[j], endPt)
    const dx = closest.easting - endPt.easting
    const dy = closest.northing - endPt.northing
    if (dx * dx + dy * dy < 1.0) {
      endEdge = i
      break
    }
  }

  // Build: startPt → polygon vertices from startEdge+1 to endEdge → endPt
  verts.push({ ...startPt })

  if (startEdge >= 0 && endEdge >= 0 && startEdge !== endEdge) {
    let idx = (startEdge + 1) % n
    const visited = new Set<number>()
    while (idx !== endEdge && !visited.has(idx)) {
      visited.add(idx)
      verts.push(polygon[idx])
      idx = (idx + 1) % n
    }
  }

  verts.push({ ...endPt })

  return verts
}

// ─── Method 4: Area-Based Subdivision ───────────────────────────────────────

function subdivideByArea(
  polygon: Point2D[],
  targetAreaHa: number,
  preferredBearing?: number
): SubdividedLot[] {
  if (targetAreaHa <= 0) return []

  const targetSqm = targetAreaHa * 10000
  const lots: SubdividedLot[] = []
  let remaining = [...polygon]
  let lotNumber = 1
  const maxIterations = 50

  for (let iter = 0; iter < maxIterations; iter++) {
    const currentArea = Math.abs(signedArea(remaining))

    if (currentArea < targetSqm * 0.05) break
    if (remaining.length < 3) break

    // If remaining area is close to target, add as last lot
    if (currentArea <= targetSqm * 1.15) {
      lots.push(makeLot(lotNumber++, remaining, targetAreaHa))
      break
    }

    // Find the longest edge of the remaining polygon
    const n = remaining.length
    let longestEdge = 0
    let longestLen = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const dx = remaining[j].easting - remaining[i].easting
      const dy = remaining[j].northing - remaining[i].northing
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > longestLen) {
        longestLen = len
        longestEdge = i
      }
    }

    const edgeStart = remaining[longestEdge]
    const edgeEnd = remaining[(longestEdge + 1) % n]
    const dx = edgeEnd.easting - edgeStart.easting
    const dy = edgeEnd.northing - edgeStart.northing

    // Determine cut bearing
    const edgeBearing = normalizeBearing(Math.atan2(dx, dy) * 180 / Math.PI)
    const cutBearing = preferredBearing !== undefined
      ? preferredBearing
      : normalizeBearing(edgeBearing + 90)

    // Try the preferred (or auto-perpendicular) bearing first.
    // If that fails (e.g. bearing parallel to polygon), try the opposite direction.
    let successfulCut = false

    for (let bearingAttempt = 0; bearingAttempt < 2 && !successfulCut; bearingAttempt++) {
      let effectiveBearing: number
      if (bearingAttempt === 0) {
        effectiveBearing = cutBearing
      } else {
        // Flip 90° — the perpendicular of the perpendicular
        effectiveBearing = normalizeBearing(cutBearing + 90)
      }

      const effectiveRad = toRadians(effectiveBearing)

      // Binary search for the cut distance along the edge
      let lo = 0
      let hi = longestLen
      let cutDist = longestLen / 2

      for (let bIter = 0; bIter < 30; bIter++) {
        cutDist = (lo + hi) / 2

        const cutPt: Point2D = {
          easting: edgeStart.easting + (dx / longestLen) * cutDist,
          northing: edgeStart.northing + (dy / longestLen) * cutDist,
        }

        const perpPt: Point2D = {
          easting: cutPt.easting + 100000 * Math.sin(effectiveRad),
          northing: cutPt.northing + 100000 * Math.cos(effectiveRad),
        }

        const pieces = splitPolygonByLine(remaining, cutPt, perpPt)

        if (pieces.length < 2) {
          hi = cutDist
          continue
        }

        // Find the smaller piece (the "cut-off" lot)
        const lotPiece = pieces.reduce((smaller, p) => {
          const a = Math.abs(signedArea(p))
          const sA = Math.abs(signedArea(smaller))
          return a < sA ? p : smaller
        }, pieces[0])

        const lotArea = Math.abs(signedArea(lotPiece))

        if (lotArea < targetSqm) {
          lo = cutDist
        } else {
          hi = cutDist
        }
      }

      // Perform final cut
      const finalCutPt: Point2D = {
        easting: edgeStart.easting + (dx / longestLen) * cutDist,
        northing: edgeStart.northing + (dy / longestLen) * cutDist,
      }

      const finalPerpPt: Point2D = {
        easting: finalCutPt.easting + 100000 * Math.sin(effectiveRad),
        northing: finalCutPt.northing + 100000 * Math.cos(effectiveRad),
      }

      const finalPieces = splitPolygonByLine(remaining, finalCutPt, finalPerpPt)

      if (finalPieces.length < 2) continue

      // Identify lot piece (smaller area) and remainder (larger area)
      const lotPiece = finalPieces.reduce((smaller, p) => {
        const a = Math.abs(signedArea(p))
        const sA = Math.abs(signedArea(smaller))
        return a < sA ? p : smaller
      }, finalPieces[0])

      const remainderPiece = finalPieces.find(p => p !== lotPiece) ?? finalPieces[1]

      lots.push(makeLot(lotNumber++, lotPiece, targetAreaHa))
      remaining = remainderPiece
      successfulCut = true
    }

    if (!successfulCut) {
      lots.push(makeLot(lotNumber++, remaining, targetAreaHa))
      break
    }
  }

  return lots
}

function makeLot(num: number, verts: Point2D[], target?: number): SubdividedLot {
  const a = areaHa(verts)
  return {
    lotNumber: num,
    vertices: stripClosing(verts),
    areaHa: a,
    perimeter: perimeter(verts),
    centroid: polyCentroid(verts),
    areaTarget: target,
    areaError: target !== undefined ? a - target : undefined,
  }
}
