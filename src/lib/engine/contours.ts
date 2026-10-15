/**
 * METARDU Contour Engine — Delaunay TIN + Marching Triangles
 *
 * Phase 25 upgrade: replaces O(n³) brute-force triangulation with
 * Delaunator-based Delaunay triangulation. Handles 10,000+ points.
 *
 * Features:
 *  - Delaunay triangulation via Delaunator (O(n log n))
 *  - Breakline enforcement through complete constrained Delaunay triangulation
 *  - Contour line threading (ordered polylines, not loose pairs)
 *  - TIN surface interpolation at any (E, N) point
 *  - Index contour marking (every 5th contour)
 *
 * Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 17
 * Source: USACE EM 1110-1-1005 — Topographic Survey Standards
 */

import { buildConstrainedTIN } from '@/lib/topo/constrainedTIN'
import { generateTINContours } from '@/lib/topo/tinContours'

export interface SpotHeight {
  name: string
  easting: number
  northing: number
  elevation: number
}

export interface ContourLine {
  elevation: number
  points: Array<{ easting: number; northing: number }>
  isIndex: boolean
}

export interface Triangle {
  p1: SpotHeight
  p2: SpotHeight
  p3: SpotHeight
}

export interface Breakline {
  start: SpotHeight
  end: SpotHeight
}

export interface TINSurface {
  triangles: Triangle[]
  points: SpotHeight[]
  bounds: { minE: number; maxE: number; minN: number; maxN: number }
}

// The established public API delegates to the shared validated survey mesh.
const surfacePoint = (p: SpotHeight) => ({ x: p.easting, y: p.northing, z: p.elevation })
function meshFor(points: SpotHeight[], breaklines: Breakline[] = []) {
  return buildConstrainedTIN(points.map(surfacePoint), breaklines.map(line => ({ type: 'hard' as const, points: [surfacePoint(line.start), surfacePoint(line.end)] })))
}

export function triangulate(points: SpotHeight[]): Triangle[] {
  if (points.length < 3) return []
  return buildTINSurface(points).triangles
}

export function buildTINSurface(points: SpotHeight[], breaklines: Breakline[] = []): TINSurface {
  if (points.length < 3) return { points: [...points], triangles: [], bounds: {
    minE: Math.min(...points.map(p => p.easting)), maxE: Math.max(...points.map(p => p.easting)),
    minN: Math.min(...points.map(p => p.northing)), maxN: Math.max(...points.map(p => p.northing)),
  } }
  const mesh = meshFor(points, breaklines)
  const names = new Map([...points, ...breaklines.flatMap(line => [line.start, line.end])].map(p => [`${p.easting}:${p.northing}`, p.name]))
  const vertices: SpotHeight[] = mesh.points.map((p, index) => ({ name: names.get(`${p.x}:${p.y}`) ?? `INTERPOLATED_BL_${index}`, easting: p.x, northing: p.y, elevation: p.z }))
  return { points: vertices, triangles: mesh.triangles.map(t => ({ p1: vertices[t.a], p2: vertices[t.b], p3: vertices[t.c] })),
    bounds: { minE: mesh.minX, maxE: mesh.maxX, minN: mesh.minY, maxN: mesh.maxY } }
}

/** Piecewise-linear isolines; indexInterval is an absolute height interval. */
export function generateContours(points: SpotHeight[], interval: number, indexInterval = interval * 5, breaklines: Breakline[] = []): ContourLine[] {
  if (!Number.isFinite(indexInterval) || indexInterval <= 0) throw new RangeError('Index interval must be finite and positive.')
  if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Contour interval must be finite and positive.')
  if (points.length < 3) return []
  const mesh = meshFor(points, breaklines)
  return generateTINContours(mesh, { interval }).flatMap(line => {
    const ratio = line.elevation / indexInterval
    return line.coordinates.map(path => ({ elevation: line.elevation, isIndex: Math.abs(ratio - Math.round(ratio)) < 1e-9,
      points: path.map(([easting, northing]) => ({ easting, northing })) }))
  })
}
// ─── TIN Surface Interpolation ──────────────────────────────────────────────

/**
 * Interpolate elevation at a point (E, N) using the TIN surface.
 * Uses barycentric coordinates within the containing triangle.
 *
 * Returns null if the point falls outside the TIN.
 */
export function interpolateElevation(
  surface: TINSurface,
  easting: number,
  northing: number
): number | null {
  for (const tri of surface.triangles) {
    const elev = barycentricInterpolation(tri, easting, northing)
    if (elev !== null) return elev
  }
  return null
}

/**
 * Barycentric interpolation within a triangle.
 * Returns the interpolated elevation if point is inside, null otherwise.
 */
function barycentricInterpolation(
  tri: Triangle,
  e: number,
  n: number
): number | null {
  const { p1, p2, p3 } = tri

  const denom = (p2.northing - p3.northing) * (p1.easting - p3.easting) +
                (p3.easting - p2.easting) * (p1.northing - p3.northing)

  if (Math.abs(denom) < 1e-12) return null

  const w1 = ((p2.northing - p3.northing) * (e - p3.easting) +
              (p3.easting - p2.easting) * (n - p3.northing)) / denom

  const w2 = ((p3.northing - p1.northing) * (e - p3.easting) +
              (p1.easting - p3.easting) * (n - p3.northing)) / denom

  const w3 = 1 - w1 - w2

  // Check if point is inside triangle (with small tolerance for edges)
  const eps = -1e-8
  if (w1 < eps || w2 < eps || w3 < eps) return null

  return w1 * p1.elevation + w2 * p2.elevation + w3 * p3.elevation
}

// ─── Volume Computation from TIN ────────────────────────────────────────────

/**
 * Compute the volume between a TIN surface and a reference plane.
 *
 * @param surface - TIN surface
 * @param referencePlane - Elevation of the reference plane (m)
 * @returns { cut, fill, net } volumes in cubic metres
 */
export function computeVolumeFromTIN(surface: TINSurface, referencePlane: number): { cut: number; fill: number; net: number } {
  if (!Number.isFinite(referencePlane)) throw new RangeError('Reference-plane RL must be finite.')
  let cut = 0, fill = 0
  type Vertex = { e: number; n: number; h: number }
  for (const triangle of surface.triangles) {
    const vertices: Vertex[] = [triangle.p1, triangle.p2, triangle.p3].map(p => {
      if (![p.easting, p.northing, p.elevation].every(Number.isFinite)) throw new RangeError('TIN volume vertices require finite coordinates and heights.')
      return { e: p.easting, n: p.northing, h: p.elevation - referencePlane }
    })
    const integrate = (above: boolean) => {
      const clipped: Vertex[] = []
      let previous = vertices[vertices.length - 1]
      for (const current of vertices) {
        const inPrevious = above ? previous.h >= 0 : previous.h <= 0
        const inCurrent = above ? current.h >= 0 : current.h <= 0
        if (inPrevious !== inCurrent) {
          const t = previous.h / (previous.h - current.h)
          clipped.push({ e: previous.e + t * (current.e - previous.e), n: previous.n + t * (current.n - previous.n), h: 0 })
        }
        if (inCurrent) clipped.push(current)
        previous = current
      }
      let volume = 0
      for (let i = 1; i < clipped.length - 1; i++) {
        const p = clipped[0], q = clipped[i], r = clipped[i + 1]
        const area = Math.abs((q.e - p.e) * (r.n - p.n) - (r.e - p.e) * (q.n - p.n)) / 2
        volume += area * Math.abs((p.h + q.h + r.h) / 3)
      }
      return volume
    }
    cut += integrate(true); fill += integrate(false)
    if (![cut, fill].every(Number.isFinite)) throw new RangeError('TIN quantities exceed the finite calculation range.')
  }
  return { cut, fill, net: cut - fill }
}

/**
 * Compute volume between two TIN surfaces (e.g., before/after for earthworks).
 *
 * Samples the difference at a grid and integrates numerically.
 */
export function computeVolumeBetweenSurfaces(
  surface1: TINSurface,
  surface2: TINSurface,
  gridSpacing: number = 1.0
): { cut: number; fill: number; net: number; method: 'midpoint-grid'; sampledArea: number; gridSpacing: number } {
  if (!Number.isFinite(gridSpacing) || gridSpacing <= 0) throw new RangeError('Grid spacing must be finite and positive.')
  for (const surface of [surface1, surface2]) {
    if (!surface.triangles.length || !Object.values(surface.bounds).every(Number.isFinite)) throw new RangeError('Surface volumes require finite bounds and observed TIN triangles.')
  }
  const minE = Math.max(surface1.bounds.minE, surface2.bounds.minE)
  const maxE = Math.min(surface1.bounds.maxE, surface2.bounds.maxE)
  const minN = Math.max(surface1.bounds.minN, surface2.bounds.minN)
  const maxN = Math.min(surface1.bounds.maxN, surface2.bounds.maxN)

  if (minE >= maxE || minN >= maxN) return { cut: 0, fill: 0, net: 0, method: 'midpoint-grid', sampledArea: 0, gridSpacing }

  let cut = 0
  let fill = 0
  const columns = Math.ceil((maxE - minE) / gridSpacing), rows = Math.ceil((maxN - minN) / gridSpacing)
  if (!Number.isSafeInteger(columns * rows) || columns * rows > 1000000 || columns * rows * (surface1.triangles.length + surface2.triangles.length) > 5000000) throw new RangeError('Surface-grid work exceeds the supported limit; increase spacing or split the area.')
  let sampledArea = 0
  for (let col = 0; col < columns; col++) {
    const left = minE + col * gridSpacing, width = Math.min(gridSpacing, maxE - left)
    for (let row = 0; row < rows; row++) {
      const bottom = minN + row * gridSpacing, height = Math.min(gridSpacing, maxN - bottom)
      const cellArea = width * height
      const z1 = interpolateElevation(surface1, left + width / 2, bottom + height / 2)
      const z2 = interpolateElevation(surface2, left + width / 2, bottom + height / 2)

      if (z1 === null || z2 === null) continue

      sampledArea += cellArea
      const diff = z1 - z2
      if (diff > 0) {
        cut += diff * cellArea
      } else {
        fill += Math.abs(diff) * cellArea
      }
    }
  }

  if (![cut, fill].every(Number.isFinite)) throw new RangeError('Surface quantities exceed the finite calculation range.')
  return { cut, fill, net: cut - fill, method: 'midpoint-grid', sampledArea, gridSpacing }
}

/**
 * Generate a small demo set of spot heights for the 3D viewer
 * (a 10x10 grid with a smooth bump + noise around an origin).
 */
export function generateDemoData(): SpotHeight[] {
  const points: SpotHeight[] = []
  const cx = 500000
  const cy = 0
  const step = 5
  const n = 10
  let idx = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const easting = cx + (i - n / 2) * step
      const northing = cy + (j - n / 2) * step
      const r = Math.sqrt((i - n / 2) ** 2 + (j - n / 2) ** 2)
      const bump = Math.max(0, 20 - r * 2)
      const elevation = 100 + bump + Math.sin(i * 0.6) * 0.5 + Math.cos(j * 0.5) * 0.5
      points.push({ name: `P${idx++}`, easting, northing, elevation })
    }
  }
  return points
}

export interface ContourLabel {
  /** Position of the label center */
  easting: number
  northing: number
  /** Elevation text to display */
  text: string
  /** Rotation angle in degrees (clockwise from east, for SVG/Canvas transform) */
  rotation: number
  /** Whether this is an index contour label (bolder text) */
  isIndex: boolean
}

export interface LabelOptions {
  /** Distance between labels along the contour line (metres). Default: 100 */
  labelSpacing?: number
  /** Minimum contour length to receive labels (metres). Default: 50 */
  minContourLength?: number
  /** Label text height in map units. Default: 2.0 */
  textHeight?: number
  /** Whether to label only index contours. Default: false */
  indexOnly?: boolean
}

/** Shared arc-length midpoint for drawing labels, including two-vertex lines. */
export function contourLabelMidpoint(contour: ContourLine): Pick<ContourLabel, 'easting' | 'northing'> | null {
  const label = labelContours([contour], { labelSpacing: Number.MAX_VALUE, minContourLength: 0, textHeight: 0 })[0]
  return label && Number.isFinite(label.easting) && Number.isFinite(label.northing)
    ? { easting: label.easting, northing: label.northing } : null
}

/**
 * Places elevation labels along contour polylines at regular intervals.
 *
 * @param contours - Array of generated contour lines
 * @param options - Configuration options for label placement
 * @returns Array of contour labels to render
 */
export function labelContours(
  contours: ContourLine[],
  options?: LabelOptions
): ContourLabel[] {
  const labelSpacing = options?.labelSpacing ?? 100
  const minContourLength = options?.minContourLength ?? 50
  const textHeight = options?.textHeight ?? 2.0
  const indexOnly = options?.indexOnly ?? false

  const labels: ContourLabel[] = []

  for (const contour of contours) {
    if (indexOnly && !contour.isIndex) continue

    const points = contour.points
    if (points.length < 2) continue

    let totalLength = 0
    const segmentLengths: number[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].easting - points[i].easting
      const dy = points[i + 1].northing - points[i].northing
      const len = Math.hypot(dx, dy)
      totalLength += len
      segmentLengths.push(len)
    }

    if (totalLength < minContourLength) continue

    // Start 20% in from start, end 20% before end
    const margin = 0.2 * totalLength
    let currentDist = margin

    // Ensure we place at least one label if the contour is long enough but labelSpacing is larger than the placiable segment
    const placeableLength = totalLength - 2 * margin
    let numLabels = Math.floor(placeableLength / labelSpacing)
    if (numLabels === 0 && placeableLength > 0) {
      // If it's long enough to have labels, but spacing is too big, just place one in the middle
      currentDist = totalLength / 2
      numLabels = 1
    }

    const text = Number(contour.elevation.toFixed(3)).toString() // Trim floating point errors
    const textWidth = text.length * (textHeight * 0.6)
    const labelRadius = Math.max(textWidth, textHeight) / 2

    // Avoid infinite loop if labelSpacing is somehow <= 0
    if (labelSpacing <= 0) break

    // Use a while loop but cap iterations to prevent infinite loop just in case
    let iterations = 0
    while (currentDist <= totalLength - margin && iterations < 10000) {
      iterations++
      let distAcc = 0
      for (let i = 0; i < points.length - 1; i++) {
        const segLen = segmentLengths[i]
        if (currentDist >= distAcc && currentDist <= distAcc + segLen) {
          const t = segLen === 0 ? 0 : (currentDist - distAcc) / segLen
          const x = points[i].easting + t * (points[i + 1].easting - points[i].easting)
          const y = points[i].northing + t * (points[i + 1].northing - points[i].northing)

          const dx = points[i + 1].easting - points[i].easting
          const dy = points[i + 1].northing - points[i].northing
          let angle = Math.atan2(dy, dx) * (180 / Math.PI)

          // Flip text if upside down for standard readability
          if (angle > 90 && angle <= 270) {
            angle -= 180
          } else if (angle < -90 && angle >= -270) {
            angle += 180
          }

          // Check collision with existing labels
          let collision = false
          for (const existing of labels) {
            const existingWidth = existing.text.length * (textHeight * 0.6)
            const existingRadius = Math.max(existingWidth, textHeight) / 2
            const dist = Math.hypot(x - existing.easting, y - existing.northing)

            // Adding a small buffer to avoid clutter
            if (dist < labelRadius + existingRadius + textHeight * 0.5) {
              collision = true
              break
            }
          }

          if (!collision) {
            labels.push({
              easting: x,
              northing: y,
              text,
              rotation: angle,
              isIndex: contour.isIndex
            })
          }
          break
        }
        distAcc += segLen
      }

      currentDist += labelSpacing
    }
  }

  return labels
}
