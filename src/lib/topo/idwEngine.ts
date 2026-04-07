/**
 * Inline synchronous IDW (Inverse Distance Weighting) engine.
 * Replaces the broken Web Worker at src/workers/idw.worker.ts.
 * Runs on the main thread — fast enough for survey point counts < 50,000.
 */

export interface SurveyPoint {
  x: number
  y: number
  z: number
}

export interface IDWGrid {
  grid: number[][]
  cols: number
  rows: number
  minX: number
  minY: number
  cellSize: number
}

export interface IDWOptions {
  power?: number
  resolution?: number
  noDataValue?: number
}

export function runIDW(points: SurveyPoint[], options: IDWOptions = {}): IDWGrid {
  const power = options.power ?? 2
  const resolution = options.resolution ?? 100
  const noData = options.noDataValue ?? -9999

  if (points.length === 0) {
    throw new Error('IDW requires at least one survey point.')
  }

  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const rawMinX = Math.min(...xs)
  const rawMaxX = Math.max(...xs)
  const rawMinY = Math.min(...ys)
  const rawMaxY = Math.max(...ys)

  const padX = (rawMaxX - rawMinX) * 0.05 || 1
  const padY = (rawMaxY - rawMinY) * 0.05 || 1
  const minX = rawMinX - padX
  const maxX = rawMaxX + padX
  const minY = rawMinY - padY
  const maxY = rawMaxY + padY

  const cellSize = Math.max((maxX - minX) / resolution, (maxY - minY) / resolution)
  const cols = Math.ceil((maxX - minX) / cellSize) + 1
  const rows = Math.ceil((maxY - minY) / cellSize) + 1

  const grid: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(noData)
  )

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = minX + col * cellSize
      const gy = minY + row * cellSize

      let weightedSum = 0
      let weightTotal = 0
      let exactHit = false

      for (const pt of points) {
        const dx = gx - pt.x
        const dy = gy - pt.y
        const d2 = dx * dx + dy * dy

        if (d2 === 0) {
          grid[row][col] = pt.z
          exactHit = true
          break
        }

        const w = 1 / Math.pow(d2, power / 2)
        weightedSum += w * pt.z
        weightTotal += w
      }

      if (!exactHit && weightTotal > 0) {
        grid[row][col] = weightedSum / weightTotal
      }
    }
  }

  return { grid, cols, rows, minX, minY, cellSize }
}

export function gridToFlat(idwGrid: IDWGrid): Float64Array {
  const { grid, rows, cols } = idwGrid
  const flat = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      flat[r * cols + c] = grid[r][c]
    }
  }
  return flat
}