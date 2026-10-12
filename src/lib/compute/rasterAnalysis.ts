/**
 * Pure TypeScript DEM analysis for an explicitly supplied regular elevation grid.
 * Grid results stay in row/column space unless a caller performs an explicit CRS transform.
 */

export type RasterAnalysisType = 'hillshade' | 'slope' | 'aspect' | 'contour' | 'statistics'

export interface RasterAnalysisParams {
  project_id: string
  analysis_type: RasterAnalysisType
  dem_source?: string
  params?: Record<string, unknown>
}

export interface RasterAnalysisResult {
  type: RasterAnalysisType
  status: 'computed' | 'unavailable'
  message?: string
  data?: unknown
}

export interface ValidatedRasterRequest {
  analysis_type: RasterAnalysisType
  params: Record<string, unknown>
}

type Grid = number[][]
type GridValue = number | null

const MAX_GRID_CELLS = 262_144
const MAX_CONTOUR_LEVELS = 500
const MAX_CONTOUR_WORK = 2_000_000

function parseGrid(value: unknown): Grid | null {
  if (!Array.isArray(value) || value.length < 1 || value.some(row => !Array.isArray(row))) return null
  const rows = value as unknown[][]
  const columns = rows[0]?.length ?? 0
  if (columns < 1 || rows.some(row => row.length !== columns) || rows.length * columns > MAX_GRID_CELLS) return null
  const grid = rows.map(row => row.map(cell => typeof cell === 'number' ? cell : Number.NaN))
  return grid.every(row => row.every(Number.isFinite)) ? grid : null
}

function numberParam(params: Record<string, unknown>, key: string, fallback?: number): number | null {
  const value = params[key]
  if (value === undefined && fallback !== undefined) return fallback
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function unavailable(type: RasterAnalysisType, message: string): RasterAnalysisResult {
  return { type, status: 'unavailable', message }
}

function rasterStats(grid: Grid) {
  const values = grid.flat()
  const { min_elevation, max_elevation, sum } = values.reduce((acc, value) => ({
    min_elevation: Math.min(acc.min_elevation, value),
    max_elevation: Math.max(acc.max_elevation, value),
    sum: acc.sum + value,
  }), { min_elevation: Number.POSITIVE_INFINITY, max_elevation: Number.NEGATIVE_INFINITY, sum: 0 })
  return {
    min_elevation,
    max_elevation,
    mean_elevation: sum / values.length,
    cell_count: values.length,
  }
}

function hornGradient(grid: Grid, row: number, col: number, cellSizeX: number, cellSizeY: number, zFactor: number, rowOrder: 'north_to_south' | 'south_to_north') {
  const z1 = grid[row - 1][col - 1], z2 = grid[row - 1][col], z3 = grid[row - 1][col + 1]
  const z4 = grid[row][col - 1], z6 = grid[row][col + 1]
  const z7 = grid[row + 1][col - 1], z8 = grid[row + 1][col], z9 = grid[row + 1][col + 1]
  const dzDe = (((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * cellSizeX)) * zFactor
  const dzDRow = (((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) / (8 * cellSizeY)) * zFactor
  const dzDn = rowOrder === 'north_to_south' ? -dzDRow : dzDRow
  const slopeRadians = Math.atan(Math.hypot(dzDe, dzDn))
  const aspectDegrees = Math.hypot(dzDe, dzDn) < 1e-12
    ? null
    : (Math.atan2(-dzDe, -dzDn) * 180 / Math.PI + 360) % 360
  return { dzDe, dzDn, slopeRadians, aspectDegrees }
}

function slopeGrid(grid: Grid, cellSizeX: number, cellSizeY: number, zFactor: number, rowOrder: 'north_to_south' | 'south_to_north') {
  const degrees: GridValue[][] = grid.map(row => row.map(() => null))
  const percent: GridValue[][] = grid.map(row => row.map(() => null))
  for (let row = 1; row < grid.length - 1; row++) {
    for (let col = 1; col < grid[row].length - 1; col++) {
      const { slopeRadians } = hornGradient(grid, row, col, cellSizeX, cellSizeY, zFactor, rowOrder)
      degrees[row][col] = slopeRadians * 180 / Math.PI
      percent[row][col] = Math.tan(slopeRadians) * 100
    }
  }
  return { slope_degrees: degrees, slope_percent: percent, edge_cells: 'null (3x3 Horn neighbourhood unavailable)' }
}

function aspectGrid(grid: Grid, cellSizeX: number, cellSizeY: number, zFactor: number, rowOrder: 'north_to_south' | 'south_to_north') {
  const values: GridValue[][] = grid.map(row => row.map(() => null))
  for (let row = 1; row < grid.length - 1; row++) {
    for (let col = 1; col < grid[row].length - 1; col++) {
      values[row][col] = hornGradient(grid, row, col, cellSizeX, cellSizeY, zFactor, rowOrder).aspectDegrees
    }
  }
  return { aspect_degrees_clockwise_from_north: values, flat_or_edge_cells: 'null' }
}

function hillshadeGrid(grid: Grid, cellSizeX: number, cellSizeY: number, zFactor: number, rowOrder: 'north_to_south' | 'south_to_north', azimuthDegrees: number, altitudeDegrees: number) {
  const values: GridValue[][] = grid.map(row => row.map(() => null))
  const azimuth = azimuthDegrees * Math.PI / 180
  const altitude = altitudeDegrees * Math.PI / 180
  const sun = { easting: Math.cos(altitude) * Math.sin(azimuth), northing: Math.cos(altitude) * Math.cos(azimuth), up: Math.sin(altitude) }
  for (let row = 1; row < grid.length - 1; row++) {
    for (let col = 1; col < grid[row].length - 1; col++) {
      const { dzDe, dzDn } = hornGradient(grid, row, col, cellSizeX, cellSizeY, zFactor, rowOrder)
      const norm = Math.hypot(dzDe, dzDn, 1)
      const illumination = Math.max(0, (-dzDe * sun.easting - dzDn * sun.northing + sun.up) / norm)
      values[row][col] = Math.round(illumination * 255)
    }
  }
  return { values_0_to_255: values, azimuth_degrees_clockwise_from_north: azimuthDegrees, altitude_degrees: altitudeDegrees, edge_cells: 'null (3x3 Horn neighbourhood unavailable)' }
}

interface GridPoint { row: number; column: number }

function contourSegments(grid: Grid, interval: number, base: number) {
  const { min_elevation: min, max_elevation: max } = rasterStats(grid)
  const first = Math.ceil((min - base) / interval) * interval + base
  const levelCount = Math.max(0, Math.floor((max - first) / interval) + 1)
  const cellCount = Math.max(0, grid.length - 1) * Math.max(0, (grid[0]?.length ?? 0) - 1)
  if (!Number.isFinite(first) || !Number.isSafeInteger(levelCount) || levelCount > MAX_CONTOUR_LEVELS || levelCount * cellCount > MAX_CONTOUR_WORK) return null
  const segments: Array<{ elevation: number; start: GridPoint; end: GridPoint }> = []

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex++) {
    const level = first + levelIndex * interval
    for (let row = 0; row < grid.length - 1; row++) {
      for (let col = 0; col < grid[row].length - 1; col++) {
        const corners = [
          { row, column: col, value: grid[row][col] },
          { row, column: col + 1, value: grid[row][col + 1] },
          { row: row + 1, column: col + 1, value: grid[row + 1][col + 1] },
          { row: row + 1, column: col, value: grid[row + 1][col] },
        ]
        const edgeCorners = [[0, 1], [1, 2], [2, 3], [3, 0]] as const
        const crossings: Array<{ edge: number; point: GridPoint }> = []
        for (let edge = 0; edge < edgeCorners.length; edge++) {
          const [aIndex, bIndex] = edgeCorners[edge]
          const a = corners[aIndex], b = corners[bIndex]
          if ((a.value < level && b.value >= level) || (b.value < level && a.value >= level)) {
            const t = (level - a.value) / (b.value - a.value)
            crossings.push({ edge, point: { row: a.row + t * (b.row - a.row), column: a.column + t * (b.column - a.column) } })
          }
        }
        const pushPair = (edgeA: number, edgeB: number) => {
          const a = crossings.find(crossing => crossing.edge === edgeA)?.point
          const b = crossings.find(crossing => crossing.edge === edgeB)?.point
          if (a && b) segments.push({ elevation: level, start: a, end: b })
        }
        if (crossings.length === 2) pushPair(crossings[0].edge, crossings[1].edge)
        else if (crossings.length === 4) {
          const centreHigh = corners.reduce((sum, corner) => sum + corner.value, 0) / 4 >= level
          if (centreHigh) { pushPair(0, 1); pushPair(2, 3) }
          else { pushPair(0, 3); pushPair(1, 2) }
        }
      }
    }
  }
  return { interval, base, segment_count: segments.length, coordinate_space: 'grid row/column indices; no map origin or CRS supplied', segments }
}

export async function computeRasterAnalysis(params: RasterAnalysisParams): Promise<RasterAnalysisResult> {
  const { analysis_type, project_id, params: options = {} } = params
  if (typeof project_id !== 'string' || !project_id.trim()) return unavailable(analysis_type, 'A project identifier is required.')
  const grid = parseGrid(options.elevation_grid)
  if (!grid) return unavailable(analysis_type, 'Supply a rectangular finite params.elevation_grid. No configured PostGIS or uploaded-GeoTIFF source is available through this endpoint.')

  if (analysis_type === 'statistics') {
    const statistics = rasterStats(grid)
    if (!Number.isFinite(statistics.mean_elevation)) return unavailable(analysis_type, 'Elevation values overflowed the statistics calculation; check input values and units.')
    return { type: analysis_type, status: 'computed', data: { ...statistics, units: 'elevation units match input grid' } }
  }
  if (analysis_type === 'contour') {
    if (grid.length < 2 || grid[0].length < 2) return unavailable(analysis_type, 'Contour extraction needs at least a 2 × 2 elevation grid.')
    const interval = numberParam(options, 'contour_interval')
    const base = numberParam(options, 'contour_base', 0)
    if (interval === null || interval <= 0 || base === null) return unavailable(analysis_type, 'Provide a positive contour_interval and finite optional contour_base.')
    const contours = contourSegments(grid, interval, base)
    return contours ? { type: analysis_type, status: 'computed', data: contours } : unavailable(analysis_type, 'Contour request exceeds the processing limits; use a wider interval or smaller grid.')
  }

  if (grid.length < 3 || grid[0].length < 3) return unavailable(analysis_type, 'Slope, aspect, and hillshade need at least a 3 × 3 elevation grid.')
  const cellSizeX = numberParam(options, 'cell_size_x')
  const cellSizeY = numberParam(options, 'cell_size_y')
  const zFactor = numberParam(options, 'z_factor')
  if (cellSizeX === null || cellSizeX <= 0 || cellSizeY === null || cellSizeY <= 0 || zFactor === null || zFactor <= 0) return unavailable(analysis_type, 'Provide positive cell_size_x, cell_size_y, and z_factor for the horizontal/elevation units.')
  const rowOrder = options.row_order
  if (rowOrder !== 'north_to_south' && rowOrder !== 'south_to_north') return unavailable(analysis_type, 'Provide row_order as north_to_south or south_to_north before directional analysis.')

  if (analysis_type === 'slope') {
    const result = slopeGrid(grid, cellSizeX, cellSizeY, zFactor, rowOrder)
    if (result.slope_degrees.some(row => row.some(value => value !== null && !Number.isFinite(value)))) return unavailable(analysis_type, 'Slope values overflowed; check grid elevations, cell sizes, and z_factor.')
    return { type: analysis_type, status: 'computed', data: { ...result, units: { slope_degrees: 'degrees', slope_percent: 'percent' } } }
  }
  if (analysis_type === 'aspect') {
    const result = aspectGrid(grid, cellSizeX, cellSizeY, zFactor, rowOrder)
    if (result.aspect_degrees_clockwise_from_north.some(row => row.some(value => value !== null && !Number.isFinite(value)))) return unavailable(analysis_type, 'Aspect values overflowed; check grid elevations, cell sizes, and z_factor.')
    return { type: analysis_type, status: 'computed', data: result }
  }
  if (analysis_type === 'hillshade') {
    const azimuth = numberParam(options, 'azimuth_degrees', 315)
    const altitude = numberParam(options, 'altitude_degrees', 45)
    if (azimuth === null || azimuth < 0 || azimuth >= 360 || altitude === null || altitude <= 0 || altitude > 90) return unavailable(analysis_type, 'Azimuth must be 0–less than 360° and altitude must be greater than 0–90°.')
    const result = hillshadeGrid(grid, cellSizeX, cellSizeY, zFactor, rowOrder, azimuth, altitude)
    if (result.values_0_to_255.some(row => row.some(value => value !== null && !Number.isFinite(value)))) return unavailable(analysis_type, 'Hillshade values overflowed; check grid elevations, cell sizes, and z_factor.')
    return { type: analysis_type, status: 'computed', data: result }
  }
  return unavailable(analysis_type, `Unsupported raster analysis type: ${String(analysis_type)}`)
}

export function validateRasterRequest(body: unknown): ValidatedRasterRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  const validTypes: RasterAnalysisType[] = ['hillshade', 'slope', 'aspect', 'contour', 'statistics']
  if (typeof value.analysis_type !== 'string' || !validTypes.includes(value.analysis_type as RasterAnalysisType)) return null
  const params = typeof value.params === 'object' && value.params !== null && !Array.isArray(value.params)
    ? value.params as Record<string, unknown>
    : {}
  return { analysis_type: value.analysis_type as RasterAnalysisType, params }
}
