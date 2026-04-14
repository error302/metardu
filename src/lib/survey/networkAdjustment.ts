/**
 * GPS/GNSS Network Least Squares Adjustment Engine
 * Phase 18 — Sprint 9
 *
 * Performs a 2D weighted least squares adjustment of a control network.
 * All coordinates in Arc 1960 / UTM Zone 37S (SRID 21037), metres.
 *
 * Reference: Ghilani & Wolf — Elementary Surveying, Chapter 15
 */

import { z } from 'zod'

export const StationSchema = z.object({
  id: z.string().min(1, 'Station ID is required'),
  name: z.string().min(1, 'Station name is required'),
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().finite(),
  isFixed: z.boolean(),
})

export type Station = z.infer<typeof StationSchema>

export const ObservationSchema = z.object({
  from: z.string().min(1, 'From station is required'),
  to: z.string().min(1, 'To station is required'),
  deltaE: z.number().finite(),
  deltaN: z.number().finite(),
  deltaH: z.number().finite(),
  stdDev: z.number().positive().max(1, 'Standard deviation must be ≤ 1m').default(0.005),
})

export type Observation = z.infer<typeof ObservationSchema>

let supabase: any = null

async function logNetworkAdjustment(stations: Station[], observations: Observation[]) {
  if (typeof window === 'undefined') return // Client-side only
  try {
    const { createClient } = await import('@/lib/supabase/client')
    supabase = createClient()
    await supabase.from('network_adjustments').insert({
      stations,
      observations,
      status: 'pending',
    })
  } catch {
    // Non-blocking
  }
}

export interface AdjustedStation extends Station {
  residualE: number
  residualN: number
  semiMajor: number
  semiMinor: number
  orientation: number
}

export interface AdjustmentResult {
  adjustedStations: AdjustedStation[]
  sigmaZero: number
  degreesOfFreedom: number
  iterations: number
  passedTolerance: boolean
  warnings: string[]
}

export function adjustNetwork(
  stations: Station[],
  observations: Observation[]
): AdjustmentResult {
  // Zod validation
  const stationValidation = StationSchema.array().safeParse(stations)
  if (!stationValidation.success) {
    const issues = stationValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid stations: ${issues}`)
  }

  const obsValidation = ObservationSchema.array().safeParse(observations)
  if (!obsValidation.success) {
    const issues = obsValidation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid observations: ${issues}`)
  }

  const warnings: string[] = []

  // Log computation attempt (non-blocking)
  logNetworkAdjustment(stations, observations).catch(() => {})

  const fixed = stations.filter(s => s.isFixed)
  if (fixed.length === 0) {
    throw new Error('At least one fixed control station is required.')
  }
  if (observations.length === 0) {
    throw new Error('At least one baseline observation is required.')
  }

   const free = stations.filter(s => !s.isFixed)
   const n = free.length * 2
   const m = observations.length * 2
   const dof = m - n

   if (dof < 0) {
     throw new Error(
       `Insufficient observations. Need at least ${n / 2} observations for ${free.length} free stations. Currently have ${observations.length}.`
     )
   }

  const stationIndex = new Map<string, number>()
  free.forEach((s, i) => stationIndex.set(s.id, i))

  const coords = new Map<string, { e: number; n: number }>()
  stations.forEach(s => coords.set(s.id, { e: s.easting, n: s.northing }))

  const A: number[][] = []
  const W: number[] = []
  const l: number[] = []

  for (const obs of observations) {
    const fromCoord = coords.get(obs.from)!
    const toCoord = coords.get(obs.to)!
    const w = 1 / (obs.stdDev * obs.stdDev)

    const rowE = new Array(n).fill(0)
    if (stationIndex.has(obs.to)) rowE[stationIndex.get(obs.to)! * 2] = 1
    if (stationIndex.has(obs.from)) rowE[stationIndex.get(obs.from)! * 2] = -1
    const obsE = toCoord.e - fromCoord.e
    A.push(rowE)
    W.push(w)
    l.push(obs.deltaE - obsE)

    const rowN = new Array(n).fill(0)
    if (stationIndex.has(obs.to)) rowN[stationIndex.get(obs.to)! * 2 + 1] = 1
    if (stationIndex.has(obs.from)) rowN[stationIndex.get(obs.from)! * 2 + 1] = -1
    const obsN = toCoord.n - fromCoord.n
    A.push(rowN)
    W.push(w)
    l.push(obs.deltaN - obsN)
  }

  const N = multiplyAtWA(A, W, n)
  const t = multiplyAtWl(A, W, l, n)
  const x = solveLinearSystem(N, t)

  free.forEach((s, i) => {
    const c = coords.get(s.id)!
    coords.set(s.id, { e: c.e + x[i * 2], n: c.n + x[i * 2 + 1] })
  })

  const residuals: number[] = []
  for (let i = 0; i < A.length; i++) {
    let ax = 0
    for (let j = 0; j < n; j++) ax += A[i][j] * x[j]
    residuals.push(ax - l[i])
  }

  const vWv = residuals.reduce((sum, v, i) => sum + W[i] * v * v, 0)
  const sigmaZero = Math.sqrt(vWv / dof)

  const Qxx = invertMatrix(N, n)

  const maxAllowedResidual = 3 * Math.max(...observations.map(o => o.stdDev))
  const passedTolerance = residuals.every(r => Math.abs(r) < maxAllowedResidual)
  if (!passedTolerance) {
    warnings.push('One or more residuals exceed 3σ tolerance. Check for blunders in baseline observations.')
  }
  if (sigmaZero > 2.0) {
    warnings.push(`Reference standard deviation (σ₀ = ${sigmaZero.toFixed(3)}) is high. Network may contain blunders or incorrect standard deviations.`)
  }

  const adjustedStations: AdjustedStation[] = stations.map(s => {
    const adjusted = coords.get(s.id)!
    let residualE = 0
    let residualN = 0
    let semiMajor = 0
    let semiMinor = 0
    let orientation = 0

    if (!s.isFixed) {
      const i = stationIndex.get(s.id)!
      residualE = x[i * 2]
      residualN = x[i * 2 + 1]

      const qEE = Qxx[i * 2][i * 2]
      const qNN = Qxx[i * 2 + 1][i * 2 + 1]
      const qEN = Qxx[i * 2][i * 2 + 1]
      const t2 = Math.atan2(2 * qEN, qEE - qNN) / 2
      const A2 = (qEE + qNN) / 2 + Math.sqrt(Math.pow((qEE - qNN) / 2, 2) + qEN * qEN)
      const B2 = (qEE + qNN) / 2 - Math.sqrt(Math.pow((qEE - qNN) / 2, 2) + qEN * qEN)
      semiMajor = sigmaZero * Math.sqrt(Math.max(A2, 0))
      semiMinor = sigmaZero * Math.sqrt(Math.max(B2, 0))
      orientation = (t2 * 180 / Math.PI + 360) % 360
    }

    return {
      ...s,
      easting: adjusted.e,
      northing: adjusted.n,
      residualE,
      residualN,
      semiMajor,
      semiMinor,
      orientation,
    }
  })

  return {
    adjustedStations,
    sigmaZero,
    degreesOfFreedom: dof,
    iterations: 1,
    passedTolerance,
    warnings,
  }
}

function multiplyAtWA(A: number[][], W: number[], n: number): number[][] {
  const result = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < A.length; k++)
        result[i][j] += A[k][i] * W[k] * A[k][j]
  return result
}

function multiplyAtWl(A: number[][], W: number[], l: number[], n: number): number[] {
  const result = new Array(n).fill(0)
  for (let i = 0; i < n; i++)
    for (let k = 0; k < A.length; k++)
      result[i] += A[k][i] * W[k] * l[k]
  return result
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    if (Math.abs(M[col][col]) < 1e-12)
      throw new Error('Singular normal equation matrix — check network geometry.')

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col]
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k]
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

function invertMatrix(A: number[][], n: number): number[][] {
  const M = A.map((row, i) => {
    const aug = [...row, ...new Array(n).fill(0)]
    aug[n + i] = 1
    return aug
  })

  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-12) return Array.from({ length: n }, () => new Array(n).fill(0))

    for (let k = 0; k < 2 * n; k++) M[col][k] /= pivot
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = M[row][col]
      for (let k = 0; k < 2 * n; k++) M[row][k] -= factor * M[col][k]
    }
  }

  return M.map(row => row.slice(n))
}