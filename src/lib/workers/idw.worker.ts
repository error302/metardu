/// <reference lib="webworker" />

export interface IDWMessage {
  type: 'idw'
  points: Array<{ x: number; y: number; z: number }>
  options?: {
    power?: number
    resolution?: number
    noDataValue?: number
  }
}

export interface IDWProgress {
  type: 'progress'
  percent: number
  rowsCompleted: number
  totalRows: number
}

export interface IDWResult {
  type: 'result'
  grid: number[][]
  cols: number
  rows: number
  minX: number
  minY: number
  cellSize: number
}

export interface IDWError {
  type: 'error'
  message: string
}

type WorkerMessage = IDWMessage | IDWProgress | IDWResult | IDWError

function runIDWWithProgress(
  points: Array<{ x: number; y: number; z: number }>,
  options: { power?: number; resolution?: number; noDataValue?: number } = {}
): IDWResult {
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

    if (row % 10 === 0 || row === rows - 1) {
      self.postMessage({
        type: 'progress',
        percent: Math.round((row + 1) / rows * 100),
        rowsCompleted: row + 1,
        totalRows: rows
      } as IDWProgress)
    }
  }

  return { type: 'result', grid, cols, rows, minX, minY, cellSize }
}

self.onmessage = (event: MessageEvent<IDWMessage>) => {
  try {
    const { type, points, options } = event.data
    if (type === 'idw') {
      const result = runIDWWithProgress(points, options)
      self.postMessage(result)
    }
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err.message } as IDWError)
  }
}