/**
 * @module leastSquaresAdjustment
 *
 * Least Squares Adjustment for survey control networks
 *
 * Implements parametric (indirect observations) least squares adjustment:
 * 1. Set up observation equations: L + V = A·X
 * 2. Form normal equations: (AᵀP A)·X = AᵀP L
 * 3. Solve for corrections: X = (AᵀP A)⁻¹ · AᵀP L
 * 4. Compute residuals, standard error, confidence ellipses
 *
 * For traverse networks:
 * - Observations: angles, distances
 * - Parameters: station coordinates (E, N)
 * - Weight matrix: P = diag(1/σ²)
 *
 * Reference: "Adjustment Computations" by Ghilani & Wolf (6th edition)
 *
 * This is needed for high-precision control surveys where Bowditch
 * (compass rule) is insufficient — it doesn't properly weight
 * different observation types.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ControlStation {
  id: string
  name: string
  easting: number
  northing: number
  isFixed: boolean  // known control point (not adjusted)
}

export interface AngleObservation {
  id: string
  fromStationId: string
  toStationId: string
  angle: number  // decimal degrees
  stdDev: number // seconds
}

export interface DistanceObservation {
  id: string
  fromStationId: string
  toStationId: string
  distance: number  // meters
  stdDev: number    // meters (e.g., 0.002 + 2ppm)
}

export interface TraverseObservations {
  stations: ControlStation[]
  angles: AngleObservation[]
  distances: DistanceObservation[]
}

export interface AdjustedStation {
  id: string
  name: string
  adjustedEasting: number
  adjustedNorthing: number
  correctionE: number  // adjustment in Easting
  correctionN: number  // adjustment in Northing
  stdDevE: number     // standard error in E
  stdDevN: number     // standard error in N
  errorEllipse: {
    semiMajor: number  // meters
    semiMinor: number  // meters
    orientation: number  // degrees from N
  }
}

export interface Residual {
  observationId: string
  type: 'angle' | 'distance'
  observed: number
  computed: number
  residual: number  // observed - computed
  standardized: number  // residual / (stdDev * referenceVar)
}

export interface LSAResult {
  adjustedStations: AdjustedStation[]
  residuals: Residual[]
  referenceVariance: number  // σ₀²
  degreesOfFreedom: number
  standardError: number  // σ₀ (a posteriori)
  passed: boolean  // chi-square test
  chiSquareValue: number
  chiSquareCritical: number
  report: string
}

// ---------------------------------------------------------------------------
// Matrix operations (minimal implementation)
// ---------------------------------------------------------------------------

type Matrix = number[][]
type Vector = number[]

function transpose(A: Matrix): Matrix {
  const rows = A.length
  const cols = A[0].length
  const result: Matrix = Array(cols).fill(null).map(() => Array(rows).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j]
    }
  }
  return result
}

function multiply(A: Matrix, B: Matrix): Matrix {
  const rowsA = A.length
  const colsA = A[0].length
  const colsB = B[0].length
  const result: Matrix = Array(rowsA).fill(null).map(() => Array(colsB).fill(0))
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j]
      }
    }
  }
  return result
}

function multiplyVector(A: Matrix, v: Vector): Vector {
  const rows = A.length
  const cols = A[0].length
  const result: Vector = Array(rows).fill(0)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i] += A[i][j] * v[j]
    }
  }
  return result
}

function multiplyDiagonal(A: Matrix, diag: Vector): Matrix {
  // Multiply Aᵀ · P where P is diagonal
  const rows = A.length
  const cols = A[0].length
  const result: Matrix = Array(rows).fill(null).map(() => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = A[i][j] * diag[i]
    }
  }
  return result
}

/**
 * Gauss-Jordan elimination to solve Ax = b and compute A⁻¹.
 */
function solveAndInvert(A: Matrix, b: Vector): { solution: Vector; inverse: Matrix } {
  const n = A.length
  // Augmented matrix [A | I | b]
  const aug: Matrix = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => (j === i ? 1 : 0)), b[i]])

  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

    const pivot = aug[col][col]
    if (Math.abs(pivot) < 1e-15) {
      throw new Error('Matrix is singular — check for redundant observations')
    }

    for (let j = 0; j < aug[col].length; j++) {
      aug[col][j] /= pivot
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = aug[row][col]
      for (let j = 0; j < aug[row].length; j++) {
        aug[row][j] -= factor * aug[col][j]
      }
    }
  }

  // Extract solution and inverse
  const solution: Vector = aug.map(row => row[row.length - 1])
  const inverse: Matrix = aug.map(row => row.slice(n, 2 * n))

  return { solution, inverse }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function computeBearing(fromE: number, fromN: number, toE: number, toN: number): number {
  const dE = toE - fromE
  const dN = toN - fromN
  let bearing = Math.atan2(dE, dN) * 180 / Math.PI
  if (bearing < 0) bearing += 360
  return bearing
}

function computeDistance(fromE: number, fromN: number, toE: number, toN: number): number {
  const dE = toE - fromE
  const dN = toN - fromN
  return Math.sqrt(dE * dE + dN * dN)
}

// ---------------------------------------------------------------------------
// Main Adjustment Function
// ---------------------------------------------------------------------------

/**
 * Perform least squares adjustment on a traverse network.
 *
 * @param observations - Stations, angles, and distances
 * @returns Adjustment results with adjusted coordinates, residuals, and statistics
 */
export function adjustTraverseLSA(observations: TraverseObservations): LSAResult {
  const { stations, angles, distances } = observations

  // Identify adjustable stations (not fixed)
  const adjustableStations = stations.filter(s => !s.isFixed)
  const paramCount = adjustableStations.length * 2  // E, N per station

  // Total observations
  const obsCount = angles.length + distances.length
  const degreesOfFreedom = obsCount - paramCount

  if (degreesOfFreedom <= 0) {
    throw new Error(`Insufficient observations: ${obsCount} observations for ${paramCount} parameters (${degreesOfFreedom} DOF)`)
  }

  // Build coefficient matrix A, observation vector L, and weight matrix P
  const A: Matrix = []
  const L: Vector = []
  const P: Vector = []  // diagonal weights

  const stationMap = new Map(stations.map(s => [s.id, s]))
  const adjStationMap = new Map(adjustableStations.map((s, i) => [s.id, i]))

  // Angle observation equations
  for (const angle of angles) {
    const from = stationMap.get(angle.fromStationId)
    const to = stationMap.get(angle.toStationId)
    if (!from || !to) continue

    const row: Vector = Array(paramCount).fill(0)

    // Computed angle from current coordinates
    const computedBearing = computeBearing(from.easting, from.northing, to.easting, to.northing)
    const computedAngle = computedBearing  // simplified — full implementation would use backsight

    // Partial derivatives
    const dist = computeDistance(from.easting, from.northing, to.easting, to.northing)
    if (dist < 0.001) continue

    const dAngle_dE_from = (to.northing - from.northing) / (dist * dist) * 180 / Math.PI
    const dAngle_dN_from = -(to.easting - from.easting) / (dist * dist) * 180 / Math.PI
    const dAngle_dE_to = -(to.northing - from.northing) / (dist * dist) * 180 / Math.PI
    const dAngle_dN_to = (to.easting - from.easting) / (dist * dist) * 180 / Math.PI

    // Fill coefficient matrix for adjustable stations
    if (!from.isFixed) {
      const idx = adjStationMap.get(from.id)
      if (idx != null) {
        row[idx * 2] = dAngle_dE_from
        row[idx * 2 + 1] = dAngle_dN_from
      }
    }
    if (!to.isFixed) {
      const idx = adjStationMap.get(to.id)
      if (idx != null) {
        row[idx * 2] = dAngle_dE_to
        row[idx * 2 + 1] = dAngle_dN_to
      }
    }

    A.push(row)
    L.push(angle.angle - computedAngle)  // misclosure
    P.push(1 / (angle.stdDev * angle.stdDev))  // weight = 1/σ²
  }

  // Distance observation equations
  for (const dist of distances) {
    const from = stationMap.get(dist.fromStationId)
    const to = stationMap.get(dist.toStationId)
    if (!from || !to) continue

    const row: Vector = Array(paramCount).fill(0)
    const computedDist = computeDistance(from.easting, from.northing, to.easting, to.northing)

    if (computedDist < 0.001) continue

    const dDist_dE_from = -(to.easting - from.easting) / computedDist
    const dDist_dN_from = -(to.northing - from.northing) / computedDist
    const dDist_dE_to = (to.easting - from.easting) / computedDist
    const dDist_dN_to = (to.northing - from.northing) / computedDist

    if (!from.isFixed) {
      const idx = adjStationMap.get(from.id)
      if (idx != null) {
        row[idx * 2] = dDist_dE_from
        row[idx * 2 + 1] = dDist_dN_from
      }
    }
    if (!to.isFixed) {
      const idx = adjStationMap.get(to.id)
      if (idx != null) {
        row[idx * 2] = dDist_dE_to
        row[idx * 2 + 1] = dDist_dN_to
      }
    }

    A.push(row)
    L.push(dist.distance - computedDist)
    P.push(1 / (dist.stdDev * dist.stdDev))
  }

  // Form normal equations: N = Aᵀ P A, t = Aᵀ P L
  const AtP = multiplyDiagonal(transpose(A), P)
  const N = multiply(AtP, A)
  const t = multiplyVector(AtP, L)

  // Solve for corrections: X = N⁻¹ · t
  const { solution: corrections, inverse: Ninv } = solveAndInvert(N, t)

  // Compute residuals: V = A·X - L
  const computedL = multiplyVector(A, corrections)
  const residuals: Residual[] = []
  let sumPVV = 0

  for (let i = 0; i < L.length; i++) {
    const v = computedL[i] - L[i]
    const stdDev = Math.sqrt(1 / P[i])
    residuals.push({
      observationId: i < angles.length ? angles[i].id : distances[i - angles.length].id,
      type: i < angles.length ? 'angle' : 'distance',
      observed: L[i],
      computed: L[i] + v,
      residual: v,
      standardized: v / stdDev,
    })
    sumPVV += P[i] * v * v
  }

  // Reference variance (a posteriori)
  const referenceVariance = sumPVV / degreesOfFreedom
  const standardError = Math.sqrt(referenceVariance)

  // Chi-square test
  const chiSquareValue = sumPVV
  // Critical value at 5% significance (approximate)
  const chiSquareCritical = degreesOfFreedom + 2 * Math.sqrt(2 * degreesOfFreedom)
  const passed = chiSquareValue <= chiSquareCritical

  // Build adjusted stations with error ellipses
  const adjustedStations: AdjustedStation[] = adjustableStations.map((station, i) => {
    const corrE = corrections[i * 2]
    const corrN = corrections[i * 2 + 1]

    // Cofactor matrix for this station
    const qEE = Ninv[i * 2][i * 2]
    const qNN = Ninv[i * 2 + 1][i * 2 + 1]
    const qEN = Ninv[i * 2][i * 2 + 1]

    const stdDevE = Math.sqrt(qEE * referenceVariance)
    const stdDevN = Math.sqrt(qNN * referenceVariance)

    // Error ellipse
    const qMax = (qEE + qNN) / 2 + Math.sqrt(((qEE - qNN) / 2) ** 2 + qEN ** 2)
    const qMin = (qEE + qNN) / 2 - Math.sqrt(((qEE - qNN) / 2) ** 2 + qEN ** 2)
    const semiMajor = Math.sqrt(qMax * referenceVariance * 2.448)  // 95% confidence
    const semiMinor = Math.sqrt(qMin * referenceVariance * 2.448)

    let orientation = Math.atan2(2 * qEN, qEE - qNN) / 2 * 180 / Math.PI
    if (orientation < 0) orientation += 180

    return {
      id: station.id,
      name: station.name,
      adjustedEasting: station.easting + corrE,
      adjustedNorthing: station.northing + corrN,
      correctionE: corrE,
      correctionN: corrN,
      stdDevE,
      stdDevN,
      errorEllipse: { semiMajor, semiMinor, orientation },
    }
  })

  // Generate report
  let report = `Least Squares Adjustment Report\n`
  report += `═══════════════════════════════\n`
  report += `Observations: ${obsCount} (${angles.length} angles, ${distances.length} distances)\n`
  report += `Parameters: ${paramCount} (${adjustableStations.length} stations × 2)\n`
  report += `Degrees of freedom: ${degreesOfFreedom}\n`
  report += `Reference variance (σ₀²): ${referenceVariance.toFixed(6)}\n`
  report += `Standard error (σ₀): ${standardError.toFixed(4)}\n`
  report += `Chi-square test: ${chiSquareValue.toFixed(2)} vs ${chiSquareCritical.toFixed(2)} → ${passed ? 'PASS' : 'FAIL'}\n`
  report += `\nAdjusted Stations:\n`
  for (const s of adjustedStations) {
    report += `  ${s.name}: E:${s.adjustedEasting.toFixed(4)} N:${s.adjustedNorthing.toFixed(4)}`
    report += ` (ΔE:${s.correctionE.toFixed(4)} ΔN:${s.correctionN.toFixed(4)})`
    report += ` σE:${s.stdDevE.toFixed(4)} σN:${s.stdDevN.toFixed(4)}\n`
  }

  return {
    adjustedStations,
    residuals,
    referenceVariance,
    degreesOfFreedom,
    standardError,
    passed,
    chiSquareValue,
    chiSquareCritical,
    report,
  }
}
