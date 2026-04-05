export interface IDWInput {
  points: { e: number; n: number; z: number }[]
  gridResolution: number
  power: number
  searchRadius: number
  bounds?: {
    minE: number; maxE: number
    minN: number; maxN: number
  }
}

export interface IDWOutput {
  grid: number[][]
  gridMinE: number
  gridMinN: number
  gridResolution: number
  cols: number
  rows: number
}

function idw(
  points: { e: number; n: number; z: number }[],
  queryE: number,
  queryN: number,
  power: number,
  searchRadius: number
): number {
  let numerator = 0
  let denominator = 0

  for (const p of points) {
    const dE = p.e - queryE
    const dN = p.n - queryN
    const dist = Math.sqrt(dE * dE + dN * dN)

    if (dist === 0) return p.z
    if (searchRadius > 0 && dist > searchRadius) continue

    const weight = 1 / Math.pow(dist, power)
    numerator += weight * p.z
    denominator += weight
  }

  if (denominator === 0) return NaN
  return numerator / denominator
}

self.onmessage = (e: MessageEvent<IDWInput>) => {
  const { points, gridResolution, power, searchRadius, bounds } = e.data

  if (points.length === 0) {
    self.postMessage({ error: 'No points provided' })
    return
  }

  const minE = bounds?.minE ?? Math.min(...points.map(p => p.e))
  const maxE = bounds?.maxE ?? Math.max(...points.map(p => p.e))
  const minN = bounds?.minN ?? Math.min(...points.map(p => p.n))
  const maxN = bounds?.maxN ?? Math.max(...points.map(p => p.n))

  const cols = Math.ceil((maxE - minE) / gridResolution) + 1
  const rows = Math.ceil((maxN - minN) / gridResolution) + 1

  const grid: number[][] = []

  for (let row = 0; row < rows; row++) {
    const gridRow: number[] = []
    const queryN = minN + row * gridResolution

    for (let col = 0; col < cols; col++) {
      const queryE = minE + col * gridResolution
      gridRow.push(idw(points, queryE, queryN, power, searchRadius))
    }

    grid.push(gridRow)

    if (row % 10 === 0) {
      self.postMessage({ progress: Math.round((row / rows) * 100) })
    }
  }

  const result: IDWOutput = {
    grid,
    gridMinE: minE,
    gridMinN: minN,
    gridResolution,
    cols,
    rows
  }

  self.postMessage({ result })
}
