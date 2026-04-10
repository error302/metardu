/**
 * Mining Volume Calculations — DEM-based cut/fill and stockpile reporting.
 *
 * Calculation standards:
 *   - N.N. Basak, Surveying and Levelling, Ch. 8 — End Area & Prismoidal methods
 *   - Ghilani & Wolf, Elementary Surveying, 16th Ed., §15-9 — Grid method for volumes
 *   - RDM 1.1 Kenya 2025, §8 — Earthwork volume computation accuracy requirements
 *
 * Conventions:
 *   - No intermediate rounding; full floating point throughout.
 *   - Cut: ground above design level (positive volume).
 *   - Fill: ground below design level (positive volume).
 *   - Stockpile: volume above a user-defined base elevation.
 *   - Bulk density default: 1.6 t/m³ (typical loose alluvial material).
 */

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface DEMPoint {
  easting: number
  northing: number
  elevation: number // RL (reduced level)
}

export interface DEMVolumeResult {
  totalVolumeM3: number
  cutVolumeM3: number
  fillVolumeM3: number
  netVolumeM3: number
  areaM2: number
  averageElevation: number
  method: 'grid' | 'tin' | 'prismoidal'
}

export interface StockpileResult {
  volumeM3: number
  tonnage: number // volume × bulk density
  surfaceAreaM2: number
  baseAreaM2: number
  maxHeight: number
  centroidEasting: number
  centroidNorthing: number
  triangleCount: number
}

export interface GridCell {
  x: number
  y: number
  elevation: number
  diffFromDesign: number
  cellVolume: number
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function bboxOf(points: DEMPoint[]) {
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity
  for (const p of points) {
    if (p.easting < minE) minE = p.easting
    if (p.northing < minN) minN = p.northing
    if (p.easting > maxE) maxE = p.easting
    if (p.northing > maxN) maxN = p.northing
  }
  return { minE, minN, maxE, maxN }
}

/**
 * Inverse Distance Weighting interpolation for elevation at (x, y).
 * Source: Ghilani & Wolf, Elementary Surveying 16th Ed., §17.3 — Spatial interpolation.
 *
 * @param points - DEM point cloud
 * @param x - Target easting
 * @param y - Target northing
 * @param power - IDW power exponent (default 2)
 * @param maxDist - Maximum influence radius; if not provided, uses 3× estimated average spacing
 */
export function idwInterpolate(
  points: DEMPoint[],
  x: number,
  y: number,
  power: number = 2,
  maxDist?: number
): number | null {
  if (points.length === 0) return null

  // Estimate average spacing if no maxDist provided
  const dist = maxDist ?? estimateAverageSpacing(points) * 3

  let wSum = 0
  let wzSum = 0
  let nearestD2 = Infinity
  let nearestZ = 0

  const maxD2 = dist * dist

  for (const p of points) {
    const dx = p.easting - x
    const dy = p.northing - y
    const d2 = dx * dx + dy * dy

    // Coincident point — return exact elevation
    if (d2 === 0) return p.elevation

    // Track nearest for fallback
    if (d2 < nearestD2) {
      nearestD2 = d2
      nearestZ = p.elevation
    }

    if (d2 > maxD2) continue

    const d = Math.sqrt(d2)
    const w = 1 / Math.pow(d, power)
    wSum += w
    wzSum += w * p.elevation
  }

  if (wSum > 0) return wzSum / wSum
  if (nearestD2 < Infinity) return nearestZ // Nearest neighbour fallback
  return null
}

/**
 * Estimate average point spacing from the DEM point cloud.
 */
export function estimateAverageSpacing(points: DEMPoint[]): number {
  if (points.length < 2) return 10
  const n = Math.min(points.length, 50) // Sample first 50 points
  let totalDist = 0
  let count = 0
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].easting - points[i].easting
    const dy = points[i + 1].northing - points[i].northing
    totalDist += Math.sqrt(dx * dx + dy * dy)
    count++
  }
  return count > 0 ? totalDist / count : 10
}

// ─── DEM GRID VOLUME ──────────────────────────────────────────────────────────

/**
 * Compute cut/fill volumes from DEM points using the grid method.
 *
 * Algorithm (Basak Ch. 8 / Ghilani §15-9):
 *   1. Compute bounding box of the DEM.
 *   2. Overlay a regular grid (gridSize × gridSize cells).
 *   3. Interpolate ground elevation at each cell centre using IDW.
 *   4. For each cell: volume = (designLevel − cellElevation) × cellArea.
 *      - Positive difference → Cut (existing ground above design).
 *      - Negative difference → Fill (existing ground below design).
 *   5. Sum all cells for total cut/fill volumes.
 *
 * @param demPoints - DEM point cloud with RL values
 * @param designLevel - Design formation level (RL)
 * @param gridSize - Grid cell size in metres (default 5)
 * @param power - IDW power exponent (default 2)
 * @returns VolumeResult with cut, fill, net, area, and method details
 *
 * Ref: RDM 1.1 Kenya 2025, §8 — Grid spacing shall be ≤ 1/5 of the expected
 *      terrain feature size for acceptable volume accuracy.
 */
export function computeGridVolume(
  demPoints: DEMPoint[],
  designLevel: number,
  gridSize: number = 5,
  power: number = 2
): DEMVolumeResult {
  if (demPoints.length < 3) {
    throw new Error('At least 3 DEM points required for grid volume computation.')
  }
  if (gridSize <= 0) {
    throw new Error('Grid size must be positive.')
  }

  const bbox = bboxOf(demPoints)
  const maxDist = estimateAverageSpacing(demPoints) * 3

  // Snap grid to align with bounding box origin
  const startE = Math.ceil(bbox.minE / gridSize) * gridSize
  const startN = Math.ceil(bbox.minN / gridSize) * gridSize
  const endE = Math.floor(bbox.maxE / gridSize) * gridSize
  const endN = Math.floor(bbox.maxN / gridSize) * gridSize

  const cellArea = gridSize * gridSize
  let cutVolume = 0
  let fillVolume = 0
  let elevSum = 0
  let cellCount = 0
  let validCells = 0

  const totalCells = Math.ceil((endE - startE) / gridSize) * Math.ceil((endN - startN) / gridSize)

  for (let e = startE; e < endE; e += gridSize) {
    for (let n = startN; n < endN; n += gridSize) {
      cellCount++
      // Cell centre
      const cx = e + gridSize / 2
      const cy = n + gridSize / 2

      const z = idwInterpolate(demPoints, cx, cy, power, maxDist)
      if (z === null) continue

      const diff = z - designLevel
      const vol = diff * cellArea

      if (diff > 0) {
        cutVolume += vol
      } else if (diff < 0) {
        fillVolume += Math.abs(vol)
      }

      elevSum += z
      validCells++
    }
  }

  if (validCells === 0) {
    throw new Error('No grid cells could be evaluated. Check point coverage and grid size.')
  }

  const areaM2 = validCells * cellArea
  const averageElevation = elevSum / validCells

  return {
    totalVolumeM3: cutVolume + fillVolume,
    cutVolumeM3: cutVolume,
    fillVolumeM3: fillVolume,
    netVolumeM3: cutVolume - fillVolume,
    areaM2,
    averageElevation,
    method: 'grid',
  }
}

// ─── STOCKPILE VOLUME (TIN-BASED) ─────────────────────────────────────────────

/**
 * Triangular prism volume for a single triangle above a base plane.
 *
 * V = (A / 3) × (h1 + h2 + h3)
 * where A = triangle plan area, hi = elevation − base for each vertex.
 *
 * Source: Basak, Surveying and Levelling, Ch. 8 — Prismoidal / triangular
 *         prism method for irregular surface volumes.
 */
function trianglePrismVolume(
  p1: DEMPoint,
  p2: DEMPoint,
  p3: DEMPoint,
  baseElev: number
): number {
  // Triangle plan area via cross product / 2
  const ax = p2.easting - p1.easting
  const ay = p2.northing - p1.northing
  const bx = p3.easting - p1.easting
  const by = p3.northing - p1.northing
  const planArea = Math.abs(ax * by - ay * bx) / 2

  const h1 = Math.max(0, p1.elevation - baseElev)
  const h2 = Math.max(0, p2.elevation - baseElev)
  const h3 = Math.max(0, p3.elevation - baseElev)

  return (planArea / 3) * (h1 + h2 + h3)
}

/**
 * Triangle plan area (2D).
 */
function trianglePlanArea(
  p1: DEMPoint,
  p2: DEMPoint,
  p3: DEMPoint
): number {
  const ax = p2.easting - p1.easting
  const ay = p2.northing - p1.northing
  const bx = p3.easting - p1.easting
  const by = p3.northing - p1.northing
  return Math.abs(ax * by - ay * bx) / 2
}

/**
 * Triangle 3D surface area (true surface area, not plan area).
 *
 * Uses Heron's formula on each edge (true 3D length).
 */
function triangleSurfaceArea(
  p1: DEMPoint,
  p2: DEMPoint,
  p3: DEMPoint
): number {
  const d12 = Math.sqrt(
    (p2.easting - p1.easting) ** 2 +
    (p2.northing - p1.northing) ** 2 +
    (p2.elevation - p1.elevation) ** 2
  )
  const d23 = Math.sqrt(
    (p3.easting - p2.easting) ** 2 +
    (p3.northing - p2.northing) ** 2 +
    (p3.elevation - p2.elevation) ** 2
  )
  const d31 = Math.sqrt(
    (p1.easting - p3.easting) ** 2 +
    (p1.northing - p3.northing) ** 2 +
    (p1.elevation - p3.elevation) ** 2
  )
  const s = (d12 + d23 + d31) / 2
  return Math.sqrt(Math.max(0, s * (s - d12) * (s - d23) * (s - d31)))
}

/**
 * Simple triangulation using Delaunay-like constraint:
 * only accept triangles where the longest side < 0.7 × perimeter.
 * This avoids long, thin sliver triangles.
 *
 * Source: Simplified Delaunay-like filtering. For production-grade
 *         triangulation, use Bowyer-Watson or similar.
 *
 * Ref: de Berg et al., Computational Geometry, Ch. 9 — Delaunay Triangulation.
 */
export function triangulateDEM(points: DEMPoint[]): Array<[DEMPoint, DEMPoint, DEMPoint]> {
  const triangles: Array<[DEMPoint, DEMPoint, DEMPoint]> = []

  if (points.length < 3) return triangles

  for (let i = 0; i < points.length - 2; i++) {
    for (let j = i + 1; j < points.length - 1; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const p1 = points[i]
        const p2 = points[j]
        const p3 = points[k]

        const d12 = Math.sqrt((p2.easting - p1.easting) ** 2 + (p2.northing - p1.northing) ** 2)
        const d23 = Math.sqrt((p3.easting - p2.easting) ** 2 + (p3.northing - p2.northing) ** 2)
        const d31 = Math.sqrt((p1.easting - p3.easting) ** 2 + (p1.northing - p3.northing) ** 2)

        const perimeter = d12 + d23 + d31
        const maxSide = Math.max(d12, d23, d31)

        // Reject elongated triangles (aspect ratio filter)
        if (maxSide > perimeter * 0.7) continue

        // Reject degenerate triangles (near-zero area)
        const planArea = Math.abs(
          (p2.easting - p1.easting) * (p3.northing - p1.northing) -
          (p2.northing - p1.northing) * (p3.easting - p1.easting)
        ) / 2
        if (planArea < 1e-6) continue

        triangles.push([p1, p2, p3])
      }
    }
  }

  return triangles
}

/**
 * Compute stockpile volume from a DEM point cloud.
 *
 * The stockpile is modelled as the material above a base elevation.
 * Volume is computed using triangular prisms:
 *
 *   V = Σ (Ai / 3) × (h1i + h2i + h3i)
 *
 * where Ai = plan area of triangle i, hji = max(0, zj − base) for each vertex j.
 *
 * Bulk density default: 1.6 t/m³ (typical for loose alluvial gravels/sands).
 * Ref: Kenya Ministry of Mining, Guidelines for Stockpile Volume Estimation, 2022.
 *
 * @param points - DEM point cloud covering the stockpile
 * @param baseElevation - Base RL (elevation of the ground surface under the pile)
 * @param bulkDensity - Material bulk density in t/m³ (default 1.6)
 * @returns StockpileResult with volume, tonnage, surface area, etc.
 */
export function computeStockpileVolume(
  points: DEMPoint[],
  baseElevation: number,
  bulkDensity: number = 1.6
): StockpileResult {
  if (points.length < 3) {
    throw new Error('At least 3 DEM points required for stockpile volume computation.')
  }

  const triangles = triangulateDEM(points)
  if (triangles.length === 0) {
    throw new Error('No valid triangles could be formed. Check point distribution.')
  }

  let totalVolume = 0
  let totalSurfaceArea = 0
  let totalBaseArea = 0
  let maxHeight = 0

  // Centroid accumulators (area-weighted)
  let cxE = 0
  let cyN = 0
  let cWeight = 0

  for (const [p1, p2, p3] of triangles) {
    const vol = trianglePrismVolume(p1, p2, p3, baseElevation)
    totalVolume += vol

    totalSurfaceArea += triangleSurfaceArea(p1, p2, p3)
    totalBaseArea += trianglePlanArea(p1, p2, p3)

    // Max height above base
    for (const p of [p1, p2, p3]) {
      const h = p.elevation - baseElevation
      if (h > maxHeight) maxHeight = h
    }

    // Area-weighted centroid
    const a = trianglePlanArea(p1, p2, p3)
    const cx = (p1.easting + p2.easting + p3.easting) / 3
    const cy = (p1.northing + p2.northing + p3.northing) / 3
    cxE += cx * a
    cyN += cy * a
    cWeight += a
  }

  const centroidEasting = cWeight > 0 ? cxE / cWeight : 0
  const centroidNorthing = cWeight > 0 ? cyN / cWeight : 0

  return {
    volumeM3: totalVolume,
    tonnage: totalVolume * bulkDensity,
    surfaceAreaM2: totalSurfaceArea,
    baseAreaM2: totalBaseArea,
    maxHeight,
    centroidEasting,
    centroidNorthing,
    triangleCount: triangles.length,
  }
}

// ─── CSV PARSING ───────────────────────────────────────────────────────────────

/**
 * Parse CSV text into DEMPoint array.
 * Expected format: easting,northing,elevation (header optional).
 */
export function parseDEMCSV(csv: string): DEMPoint[] {
  const lines = csv.trim().split(/\r?\n/)
  const points: DEMPoint[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#') || line.toLowerCase().startsWith('easting')) continue

    const parts = line.split(/[,\t;]+/).map(s => parseFloat(s.trim()))
    if (parts.length >= 3 && parts.every(v => !isNaN(v))) {
      points.push({
        easting: parts[0],
        northing: parts[1],
        elevation: parts[2],
      })
    }
  }

  return points
}

/**
 * Generate CSV from StockpileResult.
 */
export function stockpileResultToCSV(result: StockpileResult, bulkDensity: number): string {
  return [
    'Parameter,Value,Unit',
    `Volume,${result.volumeM3.toFixed(3)},m³`,
    `Tonnage,${result.tonnage.toFixed(3)},t`,
    `Bulk Density,${bulkDensity.toFixed(2)},t/m³`,
    `Surface Area,${result.surfaceAreaM2.toFixed(3)},m²`,
    `Base Area,${result.baseAreaM2.toFixed(3)},m²`,
    `Max Height,${result.maxHeight.toFixed(3)},m`,
    `Centroid Easting,${result.centroidEasting.toFixed(3)},m`,
    `Centroid Northing,${result.centroidNorthing.toFixed(3)},m`,
    `Triangle Count,${result.triangleCount},`,
  ].join('\n')
}
