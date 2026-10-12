/**
 * Cassini ↔ UTM — Helmert 4-Parameter Transformation
 *
 * The Kenyan Survey Department's 4-parameter Helmert Similarity transformation
 * to convert legacy Cassini-Soldner coordinates (FEET on Clarke 1858) to UTM
 * coordinates (METRES on Clarke 1880 / Arc 1960).
 */

import {
  CLARKE_1858_A_FT,
  CLARKE_1858_B_FT,
} from './constants'
import type {
  CassiniFeetPoint,
  UTMPoint,
  TopoSheetParams,
  CommonPoint,
  ConversionResult,
} from './types'

// ─── Conformal Correction ─────────────────────────────────────────────────

/**
 * Apply conformal correction to Cassini easting.
 * Formula:  E_conformal = E + E³/(6·a·b) + E⁵/(24·a²·b²)
 */
export function applyConformalCorrection(easting: number): number {
  const E = easting
  const a = CLARKE_1858_A_FT
  const b = CLARKE_1858_B_FT

  const ab = a * b
  const E3 = E * E * E
  const E5 = E3 * E * E

  const correction = E3 / (6 * ab) + E5 / (24 * ab * ab)

  return E + correction
}

// ─── A/B Polynomial Coefficient Solver ──────────────────────────────────

export function computeABCoefficients(
  params: TopoSheetParams,
): { A: number; B: number } | null {
  const n = params.commonPoints.length
  if (n < 3) return null

  let sumE4 = 0
  let sumE2N2 = 0
  let sumN4 = 0
  let sumE2res = 0
  let sumN2res = 0

  for (const cp of params.commonPoints) {
    const E_conf = applyConformalCorrection(cp.cassE)
    const N = cp.cassN

    const predE = params.P * E_conf + params.Q * N + params.Cx
    const residualE = cp.utmE - predE

    const E2 = E_conf * E_conf
    const N2 = N * N

    sumE4 += E2 * E2
    sumE2N2 += E2 * N2
    sumN4 += N2 * N2
    sumE2res += E2 * residualE
    sumN2res += N2 * residualE
  }

  const det = sumE4 * sumN4 - sumE2N2 * sumE2N2
  if (Math.abs(det) < 1e-60) return null

  const A = (sumN4 * sumE2res - sumE2N2 * sumN2res) / det
  const B = (sumE4 * sumN2res - sumE2N2 * sumE2res) / det

  return { A, B }
}

// ─── Least-Squares Helmert 4-Parameter Solver ─────────────────────────────

export function computeHelmert4Params(
  commonPoints: CommonPoint[],
): Omit<TopoSheetParams, 'commonPoints' | 'A' | 'B'> & { commonPoints: CommonPoint[] } {
  if (commonPoints.length < 2) {
    throw new Error(
      `computeHelmert4Params requires at least 2 common points; got ${commonPoints.length}`,
    )
  }

  const n = commonPoints.length

  const rows: number[][] = []
  const obs: number[] = []

  for (const cp of commonPoints) {
    const Econf = applyConformalCorrection(cp.cassE)
    const Nabs = cp.cassN

    rows.push([Econf,  Nabs, 1, 0])
    obs.push(cp.utmE)

    rows.push([Nabs, -Econf, 0, 1])
    obs.push(cp.utmN)
  }

  const cols = 4
  const MTM: number[][] = Array.from({ length: cols }, () => new Array<number>(cols).fill(0))
  const MTab: number[] = new Array<number>(cols).fill(0)

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    for (let c1 = 0; c1 < cols; c1++) {
      for (let c2 = 0; c2 < cols; c2++) {
        MTM[c1][c2] += rows[rIdx][c1] * rows[rIdx][c2]
      }
      MTab[c1] += rows[rIdx][c1] * obs[rIdx]
    }
  }

  const x = solveLinear4x4(MTM, MTab)

  return {
    id: 'computed',
    name: 'Computed Parameters',
    description: `Helmert parameters computed from ${n} common points via least-squares.`,
    P: x[0],
    Q: x[1],
    Cx: x[2],
    Cy: x[3],
    commonPoints,
  }
}

function solveLinear4x4(A: number[][], b: number[]): number[] {
  const n = 4
  const aug = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col])
        maxRow = row
      }
    }
    if (maxVal < 1e-20) {
      throw new Error('Singular matrix in Helmert parameter computation')
    }
    if (maxRow !== col) {
      ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
    }

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j]
      }
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j]
    }
    x[i] = sum / aug[i][i]
  }

  return x
}

// ─── Forward Transformation: Cassini Feet → UTM Metres ───────────────────

function validateTransform(points: Array<{ easting: number; northing: number }>, params: TopoSheetParams): void {
  if (![params.P, params.Q, params.Cx, params.Cy, params.A ?? 0, params.B ?? 0].every(Number.isFinite)
    || Math.hypot(params.P, params.Q) < 1e-12) throw new RangeError('Transformation parameters must be finite and non-singular.')
  if ((params.A === undefined) !== (params.B === undefined)) throw new RangeError('Polynomial correction needs both A and B coefficients.')
  if (!points.every(p => Number.isFinite(p.easting) && Number.isFinite(p.northing))) throw new RangeError('Transformation coordinates must be finite.')
}
function resultFor(id: string | undefined, cassE: number, cassN: number, confE: number, utmE: number, utmN: number): ConversionResult {
  if (![cassE, cassN, confE, utmE, utmN].every(Number.isFinite)) throw new RangeError('Transformation exceeded its numerical range.')
  const result = { id, cassiniE: Math.round(cassE * 10) / 10, cassiniN: Math.round(cassN * 10) / 10,
    conformalE: Math.round(confE * 10) / 10, utmE: Math.round(utmE * 1000) / 1000, utmN: Math.round(utmN * 1000) / 1000 }
  if (![result.cassiniE, result.cassiniN, result.conformalE, result.utmE, result.utmN].every(Number.isFinite)) throw new RangeError('Transformation exceeded its output range.')
  return result
}
export function cassiniFeetToUTM(points: CassiniFeetPoint[], params: TopoSheetParams): ConversionResult[] {
  validateTransform(points, params)
  return points.map(pt => {
    const confE = applyConformalCorrection(pt.easting)
    const utmE = params.P * confE + params.Q * pt.northing + params.Cx
      + (params.A ?? 0) * confE ** 2 + (params.B ?? 0) * pt.northing ** 2
    const utmN = -params.Q * confE + params.P * pt.northing + params.Cy
    return resultFor(pt.id, pt.easting, pt.northing, confE, utmE, utmN)
  })
}

// Invert the exact selected sheet model, including both polynomial terms.
// This establishes numerical reversibility, not independent control accuracy.
export function utmToCassiniFeet(points: UTMPoint[], params: TopoSheetParams): ConversionResult[] {
  validateTransform(points, params)
  const { P, Q, Cx, Cy } = params, A = params.A ?? 0, B = params.B ?? 0
  return points.map(pt => {
    const dE = pt.easting - Cx, dN = pt.northing - Cy, det = P * P + Q * Q
    let confE = (P * dE - Q * dN) / det, cassN = (Q * dE + P * dN) / det
    let converged = false
    for (let i = 0; i < 24; i++) {
      const f = P * confE + Q * cassN + A * confE ** 2 + B * cassN ** 2 - dE
      const g = -Q * confE + P * cassN - dN
      const error = Math.hypot(f, g)
      if (error <= 1e-7) { converged = true; break }
      const j11 = P + 2 * A * confE, j12 = Q + 2 * B * cassN, jac = j11 * P + j12 * Q
      if (!Number.isFinite(jac) || Math.abs(jac) < 1e-24) throw new RangeError('Inverse transformation is singular at this point.')
      const dx = (P * f - j12 * g) / jac, dn = (Q * f + j11 * g) / jac
      let accepted = false
      for (let damping = 1; damping >= 1 / 4096; damping /= 2) {
        const x = confE - damping * dx, n = cassN - damping * dn
        const nextError = Math.hypot(P * x + Q * n + A * x ** 2 + B * n ** 2 - dE, -Q * x + P * n - dN)
        if (Number.isFinite(nextError) && nextError < error) { confE = x; cassN = n; accepted = true; break }
      }
      if (!accepted) throw new RangeError('Inverse transformation did not converge.')
    }
    if (!converged) throw new RangeError('Inverse transformation did not converge.')
    const ab = CLARKE_1858_A_FT * CLARKE_1858_B_FT
    let cassE = confE, conformalConverged = false
    for (let i = 0; i < 16; i++) {
      const residual = applyConformalCorrection(cassE) - confE
      if (Math.abs(residual) <= 1e-8) { conformalConverged = true; break }
      const derivative = 1 + cassE ** 2 / (2 * ab) + 5 * cassE ** 4 / (24 * ab * ab)
      cassE -= residual / derivative
      if (!Number.isFinite(cassE)) break
    }
    if (!conformalConverged) throw new RangeError('Inverse conformal correction did not converge.')
    return { ...resultFor(pt.id, cassE, cassN, confE, pt.easting, pt.northing),
      warning: 'Numerical inverse of the selected sheet model; verify source control before cadastral use.' }
  })
}
