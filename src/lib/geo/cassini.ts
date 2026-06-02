/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Kenyan Cassini-Soldner ↔ UTM Coordinate Conversion
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements the Kenyan Survey Department's 4-parameter Helmert Similarity
 * transformation to convert legacy Cassini-Soldner coordinates (in FEET on
 * Clarke 1858) to UTM coordinates (in METRES on Clarke 1880 / Arc 1960).
 *
 * ## ⚠️  CRITICAL: Units
 *   - ALL Cassini inputs/outputs are in **FEET** (Clarke 1858)
 *   - ALL UTM inputs/outputs are in **METRES** (Clarke 1880 / Arc 1960)
 *
 * ## Method
 *   1. Conformal correction of Cassini easting (Cassini is non-conformal)
 *   2. 4-parameter Helmert Similarity transformation (scale + rotation + translation)
 *
 * Each topographic sheet has its own Helmert parameters derived from common
 * control points known in both coordinate systems.
 *
 * ## References
 *   - T.G. Gacoki (2018), "Cassini-Soldner to UTM Transformation for
 *     Cadastral Purposes in Kenya", FIG Congress 2018
 *   - Kenya Survey Department XLS transformation workbooks
 *   - Arc 1960 datum, UTM Zone 37S
 *   - Cassini meridian of origin: 37°E
 *   - UTM central meridian: 39°E (Zone 37)
 *   - UTM scale factor: 0.9996, false origin: 500,000E / 10,000,000S
 *
 * This is PURE MATH — no proj4 or external projection libraries needed
 * for the core Helmert transformation. proj4 is used only for the
 * optional UTM→WGS84 geographic conversion.
 */

import proj4 from 'proj4'

// ─── proj4 Definitions ──────────────────────────────────────────────────────

/** WGS84 geographic CRS (lat/lon in degrees) */
const WGS84_DEF = '+proj=longlat +datum=WGS84 +no_defs'

/** UTM Zone 37 South (Arc 1960 / Clarke 1880 / WGS84 ellipsoid fallback) */
const UTM37S_DEF = '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs'

// ─── Ellipsoid Constants ──────────────────────────────────────────────────

/** Clarke 1858 semi-major axis in INTERNATIONAL FEET */
export const CLARKE_1858_A_FT = 20_926_348

/** Clarke 1858 semi-minor axis in INTERNATIONAL FEET */
export const CLARKE_1858_B_FT = 20_855_232.84

/** Clarke 1858 flattening */
export const CLARKE_1858_F = 0.003398355

/** Clarke 1880 (Arc 1960) semi-major axis in METRES */
export const CLARKE_1880_A_M = 6_378_249.145

/** Clarke 1880 (Arc 1960) semi-minor axis in METRES */
export const CLARKE_1880_B_M = 6_356_514.87

/** International foot to metre conversion (for reference only; P handles this) */
export const FT_TO_M = 0.3048

// ─── Interface Definitions ───────────────────────────────────────────────

/**
 * A point in Cassini-Soldner coordinates.
 * ⚠️ Units are FEET on Clarke 1858 / Arc 1960 datum.
 */
export interface CassiniFeetPoint {
  id?: string
  easting: number   // Cassini easting in FEET
  northing: number   // Cassini northing in FEET (negative = south of origin)
}

/**
 * A point in UTM coordinates.
 * ⚠️ Units are METRES on Clarke 1880 / Arc 1960 datum, UTM Zone 37S.
 */
export interface UTMPoint {
  id?: string
  easting: number    // UTM easting in METRES
  northing: number   // UTM northing in METRES
}

/**
 * 4-parameter Helmert Similarity transformation parameters for a single
 * topographic sheet. Each sheet has unique parameters derived from
 * common control points.
 */
export interface TopoSheetParams {
  /** Sheet identifier, e.g. "148/1" */
  id: string
  /** Human-readable sheet name */
  name: string
  /** Description of the area covered */
  description: string
  /**
   * Scale factor — approximately 0.3048 (feet→metres conversion),
   * refined by the least-squares fit to common points.
   */
  P: number
  /**
   * Rotation factor — very small (order of 1e-5 radians).
   * Derived from the least-squares fit.
   */
  Q: number
  /** Easting translation in metres (includes UTM false easting offset) */
  Cx: number
  /** Northing translation in metres (includes UTM false northing of 10,000,000m) */
  Cy: number
  /**
   * Second-degree coefficient for polynomial refinement (optional).
   * Used in enhanced transformations.
   */
  A?: number
  /**
   * Second-degree coefficient for polynomial refinement (optional).
   * Used in enhanced transformations.
   */
  B?: number
  /** Control points used to derive these parameters */
  commonPoints: CommonPoint[]
}

/**
 * A control point with known coordinates in both Cassini and UTM systems.
 * Used to derive and verify Helmert transformation parameters.
 */
export interface CommonPoint {
  /** Station name / ID (e.g. "SKP209") */
  station: string
  /** Cassini northing in FEET (negative for south of origin) */
  cassN: number
  /** Cassini easting in FEET */
  cassE: number
  /** UTM northing in METRES (includes 10M false northing) */
  utmN: number
  /** UTM easting in METRES */
  utmE: number
}

/**
 * Result of a Cassini ↔ UTM conversion, including intermediate conformal
 * correction values for traceability.
 */
export interface ConversionResult {
  id?: string
  /** Input Cassini easting (feet) */
  cassiniE: number
  /** Input Cassini northing (feet) */
  cassiniN: number
  /** Conformal-corrected easting (feet) — intermediate value */
  conformalE: number
  /** Output UTM easting (metres) */
  utmE: number
  /** Output UTM northing (metres) */
  utmN: number
  /** Warning message if applicable */
  warning?: string
}

/**
 * Residual analysis for a common point: compares expected UTM coordinates
 * against those computed by the Helmert transformation.
 */
export interface VerificationResult {
  station: string
  /** Known UTM easting from survey data */
  expectedE: number
  /** UTM easting computed by the Helmert transform */
  computedE: number
  /** Residual in easting (metres) */
  residualE: number
  /** Known UTM northing from survey data */
  expectedN: number
  /** UTM northing computed by the Helmert transform */
  computedN: number
  /** Residual in northing (metres) */
  residualN: number
}

// ─── Common Points Data ───────────────────────────────────────────────────

/** Common points for Sheet 148/1 */
const COMMON_POINTS_148_1: CommonPoint[] = [
  { station: 'SKP209', cassN: -348685.6, cassE: -130490.6, utmN: 9_893_875.453, utmE: 237_730.756 },
  { station: '149S3',  cassN: -533392.5, cassE: 22_492.0,   utmN: 9_837_592.78,  utmE: 284_419.1 },
  { station: 'SKP208', cassN: -514849.9, cassE: -132_480.9, utmN: 9_843_205.245, utmE: 237_160.304 },
]

/** Common points for Sheet 148/2 */
const COMMON_POINTS_148_2: CommonPoint[] = [
  { station: '149S3',  cassN: -533392.5, cassE: 22_492.0,   utmN: 9_837_592.78,  utmE: 284_419.1 },
  { station: 'SKP208', cassN: -514849.9, cassE: -132_480.9, utmN: 9_843_205.245, utmE: 237_160.304 },
  { station: '134S3',  cassN: -350246.1, cassE: -36_272.8,  utmN: 9_893_417.308, utmE: 266_460.401 },
]

/** Common points for Sheet 148/2.1 */
const COMMON_POINTS_148_2_1: CommonPoint[] = [
  { station: 'SKP208', cassN: -514849.9, cassE: -132_480.9, utmN: 9_843_205.245, utmE: 237_160.304 },
  { station: 'SKP216', cassN: -413209.9, cassE: 93_421.4,   utmN: 9_874_247.916, utmE: 306_011.964 },
  { station: 'SKP108', cassN: -227515.2, cassE: -107_093.2, utmN: 9_930_827.74,  utmE: 244_847.96 },
]

/** Common points for Sheet 148/3 */
const COMMON_POINTS_148_3: CommonPoint[] = [
  { station: 'SKP208', cassN: -514849.9, cassE: -132_480.9, utmN: 9_843_205.245, utmE: 237_160.304 },
  { station: 'SKP110', cassN: -332053.0, cassE: -202_412.9, utmN: 9_898_935.545, utmE: 215_793.802 },
  { station: 'SKP216', cassN: -413209.9, cassE: 93_421.4,   utmN: 9_874_247.916, utmE: 306_011.964 },
]

/** Common points for Sheet 148/4 (same as 148/2) */
const COMMON_POINTS_148_4 = COMMON_POINTS_148_2

/** Common points for Sheet 148/4.1 */
const COMMON_POINTS_148_4_1: CommonPoint[] = [
  { station: 'SKP209', cassN: -348685.6, cassE: -130_490.6, utmN: 9_893_875.453, utmE: 237_730.756 },
  { station: 'SKP216', cassN: -413209.9, cassE: 93_421.4,   utmN: 9_874_247.916, utmE: 306_011.964 },
  { station: 'SKP39',  cassN: -720628.41, cassE: -93_529.74, utmN: 9_780_469.731, utmE: 249_103.7 },
]

// ─── Pre-loaded Topographic Sheet Parameters ───────────────────────────────

/**
 * Pre-loaded Helmert transformation parameters for Kenyan topographic sheets.
 *
 * These parameters were derived from the Kenya Survey Department's XLS
 * transformation workbooks. Each sheet covers a specific geographic area
 * and has unique parameters based on common control points.
 *
 * ⚠️ ALWAYS verify which sheet your points fall within before conversion.
 * Using the wrong sheet parameters will produce incorrect results.
 */
export const KENYA_TOPO_SHEETS: TopoSheetParams[] = [
  {
    id: '148/1',
    name: 'Sheet 148/1',
    description: 'Kenya topographic sheet 148/1. Common points: SKP209, 149S3, SKP208.',
    P: 0.3048343321606808,
    Q: 4.862535115535138e-05,
    Cx: 277474.6045159159,
    Cy: 10000198.35386753,
    A: -2.1449579352267323e-10,
    B: 5.44633158017227e-11,
    commonPoints: COMMON_POINTS_148_1,
  },
  {
    id: '148/2',
    name: 'Sheet 148/2',
    description: 'Kenya topographic sheet 148/2. Common points: 149S3, SKP208, 134S3.',
    P: 0.30483331557479687,
    Q: 1.0342419045628048e-05,
    Cx: 277484.8274610074,
    Cy: 10000196.999482632,
    A: -2.507197995223198e-10,
    B: 5.163220545556513e-11,
    commonPoints: COMMON_POINTS_148_2,
  },
  {
    id: '148/2.1',
    name: 'Sheet 148/2.1',
    description: 'Kenya topographic sheet 148/2.1. Common points: SKP208, SKP216, SKP108.',
    P: 0.30485564547893773,
    Q: 1.9017478052774095e-05,
    Cx: 277483.5511268431,
    Cy: 10000201.694547474,
    A: -2.364228563356968e-10,
    B: 2.738988810063736e-11,
    commonPoints: COMMON_POINTS_148_2_1,
  },
  {
    id: '148/3',
    name: 'Sheet 148/3',
    description: 'Kenya topographic sheet 148/3. Common points: SKP208, SKP110, SKP216.',
    P: 0.30487306409668236,
    Q: 2.264994600409409e-05,
    Cx: 277482.61733914545,
    Cy: 10000205.906371474,
    A: -2.3172737079885097e-10,
    B: 8.818206581606702e-12,
    commonPoints: COMMON_POINTS_148_3,
  },
  {
    id: '148/4',
    name: 'Sheet 148/4',
    description: 'Kenya topographic sheet 148/4. Common points: 149S3, SKP208, 134S3 (same as 148/2).',
    P: 0.30483331557479687,
    Q: 1.0342419045628048e-05,
    Cx: 277484.8274610074,
    Cy: 10000196.999482632,
    A: -2.507197995223198e-10,
    B: 5.163220545556513e-11,
    commonPoints: COMMON_POINTS_148_4,
  },
  {
    id: '148/4.1',
    name: 'Sheet 148/4.1',
    description: 'Kenya topographic sheet 148/4.1. Common points: SKP209, SKP216, SKP39.',
    P: 0.30488487554066523,
    Q: 2.193208223388865e-05,
    Cx: 277482.6158913227,
    Cy: 10000207.770590663,
    A: -2.350673110481337e-10,
    B: -8.622103465222297e-12,
    commonPoints: COMMON_POINTS_148_4_1,
  },
]

// ─── Conformal Correction ─────────────────────────────────────────────────

/**
 * Apply conformal correction to Cassini easting.
 *
 * The Cassini-Soldner projection is NOT conformal (does not preserve angles),
 * which means the Helmert transformation (which assumes conformality) would
 * introduce errors. This correction compensates by adding a term that depends
 * on the cube and fifth power of the easting.
 *
 * Formula:  E_conformal = E + E³/(6·a·b) + E⁵/(24·a²·b²)
 *
 * Where:
 *   - E = raw Cassini easting in FEET
 *   - a = Clarke 1858 semi-major axis (20,926,348 ft)
 *   - b = Clarke 1858 semi-minor axis (20,855,232.84 ft)
 *
 * The correction is typically < 2 feet for typical Kenya survey distances.
 *
 * @param easting - Raw Cassini easting in FEET
 * @returns Conformal-corrected easting in FEET
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

// ─── Least-Squares Helmert 4-Parameter Solver ─────────────────────────────

/**
 * Compute 4-parameter Helmert Similarity transformation from common points.
 *
 * This solves the system of equations:
 *   UTM_E = P · E_conformal + Q · N_abs + Cx
 *   UTM_N = -Q · E_conformal + P · N_abs + Cy
 *
 * Using least-squares regression from at least 2 common points.
 * With exactly 2 points the solution is exact; with 3+ it is overdetermined
 * and the least-squares fit minimises residuals.
 *
 * @param commonPoints - Array of at least 2 common points
 * @returns TopoSheetParams with computed P, Q, Cx, Cy (and placeholder id/name)
 * @throws Error if fewer than 2 common points provided
 *
 * @example
 * ```ts
 * const params = computeHelmert4Params([
 *   { station: 'A', cassN: -350000, cassE: -130000, utmN: 9893000, utmE: 237700 },
 *   { station: 'B', cassN: -530000, cassE:  22000,  utmN: 9838000, utmE: 284400 },
 * ])
 * // params.P ≈ 0.3048, params.Q ≈ 1e-5, etc.
 * ```
 */
export function computeHelmert4Params(
  commonPoints: CommonPoint[],
): Omit<TopoSheetParams, 'commonPoints' | 'A' | 'B'> & { commonPoints: CommonPoint[] } {
  if (commonPoints.length < 2) {
    throw new Error(
      `computeHelmert4Params requires at least 2 common points; got ${commonPoints.length}`,
    )
  }

  const n = commonPoints.length

  // Build observation matrix A and right-hand side vectors bE, bN
  // For each point i:
  //   UTM_E_i = P · Econf_i + Q · Nabs_i + Cx   (with constant term)
  //   UTM_N_i = -Q · Econf_i + P · Nabs_i + Cy
  //
  // Rearranging for the constant term, we augment the matrix.
  // We solve two separate systems: one for (P, Q, Cx), one for (P, Q, Cy).
  //
  // Actually, the Helmert similarity couples the equations through P and Q.
  // The proper approach: set up the combined normal equations.
  //
  // For point i:
  //   utmE_i = P · Econf_i + Q · Nabs_i + Cx
  //   utmN_i = -Q · Econf_i + P · Nabs_i + Cy
  //
  // This gives 2n equations in 4 unknowns (P, Q, Cx, Cy).
  // Matrix form: M · [P, Q, Cx, Cy]^T = [utmE_1, utmN_1, utmE_2, utmN_2, ...]^T
  //
  // M row for utmE: [Econf_i,  Nabs_i, 1, 0]
  // M row for utmN: [Nabs_i,  -Econf_i, 0, 1]

  // Build the 2n×4 design matrix and 2n observation vector
  const rows: number[][] = []
  const obs: number[] = []

  for (const cp of commonPoints) {
    const Econf = applyConformalCorrection(cp.cassE)
    const Nabs = Math.abs(cp.cassN)

    // Equation from easting
    rows.push([Econf,  Nabs, 1, 0])
    obs.push(cp.utmE)

    // Equation from northing
    rows.push([Nabs, -Econf, 0, 1])
    obs.push(cp.utmN)
  }

  // Solve M^T · M · x = M^T · obs  (normal equations)
  const cols = 4
  const MTM = Array.from({ length: cols }, () => new Array(cols).fill(0))
  const MTab = new Array(cols).fill(0)

  for (let r = 0; r < rows.length; r++) {
    for (let c1 = 0; c1 < cols; c1++) {
      for (let c2 = 0; c2 < cols; c2++) {
        MTM[c1][c2] += rows[r][c1] * rows[r][c2]
      }
      MTab[c1] += rows[r][c1] * obs[r]
    }
  }

  // Solve 4×4 system using Gaussian elimination with partial pivoting
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

/**
 * Solve a 4×4 linear system Ax = b using Gaussian elimination with partial pivoting.
 * Returns the solution vector x.
 */
function solveLinear4x4(A: number[][], b: number[]): number[] {
  const n = 4
  // Augmented matrix [A | b]
  const aug = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivoting
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

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j]
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0)
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

/**
 * Convert Cassini-Soldner coordinates (FEET) to UTM coordinates (METRES)
 * using the 4-parameter Helmert Similarity transformation.
 *
 * Steps:
 * 1. Apply conformal correction to Cassini easting
 * 2. Apply Helmert transformation: rotation + scale + translation
 * 3. Round results to 3 decimal places (millimetre precision)
 *
 * @param points - Array of Cassini coordinates in FEET
 * @param params - Helmert transformation parameters for the relevant topo sheet
 * @returns Array of conversion results with UTM coordinates in METRES
 *
 * @example
 * ```ts
 * const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')!
 * const results = cassiniFeetToUTM(
 *   [{ id: 'P1', easting: -130490.6, northing: -348685.6 }],
 *   sheet
 * )
 * console.log(results[0]) // utmE ≈ 237730.756, utmN ≈ 9893875.453
 * ```
 */
export function cassiniFeetToUTM(
  points: CassiniFeetPoint[],
  params: TopoSheetParams,
): ConversionResult[] {
  return points.map((pt) => {
    try {
      const cassE = pt.easting
      const cassN = pt.northing

      // Step 1: Conformal correction
      const E_conf = applyConformalCorrection(cassE)

      // Step 2: Use absolute northing (Cassini N is negative in southern hemisphere)
      const N_abs = Math.abs(cassN)

      // Step 3: Helmert transformation
      const utmE = params.P * E_conf + params.Q * N_abs + params.Cx
      const utmN = -params.Q * E_conf + params.P * N_abs + params.Cy

      // Round: 1 decimal for feet, 3 decimals for metres
      const roundedCassE = Math.round(cassE * 10) / 10
      const roundedCassN = Math.round(cassN * 10) / 10
      const roundedUtmE = Math.round(utmE * 1000) / 1000
      const roundedUtmN = Math.round(utmN * 1000) / 1000
      const roundedE_conf = Math.round(E_conf * 10) / 10

      return {
        id: pt.id,
        cassiniE: roundedCassE,
        cassiniN: roundedCassN,
        conformalE: roundedE_conf,
        utmE: roundedUtmE,
        utmN: roundedUtmN,
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        conformalE: applyConformalCorrection(pt.easting),
        utmE: 0,
        utmN: 0,
        warning: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── Inverse Transformation: UTM Metres → Cassini Feet ────────────────────

/**
 * Convert UTM coordinates (METRES) back to Cassini-Soldner coordinates (FEET)
 * using the inverse Helmert Similarity transformation.
 *
 * ⚠️ IMPORTANT: This is an approximate inverse. The conformal correction
 * (Step 1 in the forward direction) is not exactly invertible by a simple
 * closed-form formula. The result is the conformal-corrected easting
 * treated as the raw easting, which introduces a small error (< ~0.6 ft
 * for typical Kenya survey distances). For cadastral-grade accuracy,
 * iterate using the forward transform until convergence.
 *
 * Steps:
 * 1. Inverse Helmert: translate, then apply the inverse rotation-scale matrix
 * 2. Negate northing (southern hemisphere convention)
 *
 * @param utmPoints - Array of UTM coordinates in METRES
 * @param params - Helmert transformation parameters for the relevant topo sheet
 * @returns Array of conversion results with Cassini coordinates in FEET
 */
export function utmToCassiniFeet(
  utmPoints: UTMPoint[],
  params: TopoSheetParams,
): ConversionResult[] {
  return utmPoints.map((pt) => {
    try {
      const utmE = pt.easting
      const utmN = pt.northing

      // Step 1: Remove translation
      const dE = utmE - params.Cx
      const dN = utmN - params.Cy

      // Step 2: Inverse Helmert rotation-scale
      // Forward: [E_utm] = [P  Q] [E_conf] + [Cx]
      //          [N_utm]   [-Q P] [N_abs]   [Cy]
      //
      // Inverse: det = P² + Q²
      //   E_conf = (P · dE - Q · dN) / det
      //   N_abs  = (Q · dE + P · dN) / det
      const det = params.P * params.P + params.Q * params.Q

      const E_conf = (params.P * dE - params.Q * dN) / det
      const N_abs = (params.Q * dE + params.P * dN) / det

      // Step 3: The E_conf is conformal-corrected easting, not raw easting.
      // Approximate: cassE ≈ E_conf (conformal correction is small, ~1-2 ft)
      // For better accuracy, one could iterate:
      //   cassE_guess = E_conf
      //   correction = cassE³/(6ab) + cassE⁵/(24a²b²)
      //   cassE = E_conf - correction
      //   repeat...
      let cassE = E_conf
      for (let iter = 0; iter < 3; iter++) {
        const ab = CLARKE_1858_A_FT * CLARKE_1858_B_FT
        const correction = (cassE * cassE * cassE) / (6 * ab)
          + (cassE ** 5) / (24 * ab * ab)
        cassE = E_conf - correction
      }

      // Southern hemisphere: Cassini northing is negative
      const cassN = -N_abs

      // Round results
      const roundedCassE = Math.round(cassE * 10) / 10
      const roundedCassN = Math.round(cassN * 10) / 10
      const roundedUtmE = Math.round(utmE * 1000) / 1000
      const roundedUtmN = Math.round(utmN * 1000) / 1000
      const roundedE_conf = Math.round(E_conf * 10) / 10

      return {
        id: pt.id,
        cassiniE: roundedCassE,
        cassiniN: roundedCassN,
        conformalE: roundedE_conf,
        utmE: roundedUtmE,
        utmN: roundedUtmN,
        warning: 'Approximate inverse — conformal correction removed iteratively. Verify for cadastral use.',
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: 0,
        cassiniN: 0,
        conformalE: 0,
        utmE: pt.easting,
        utmN: pt.northing,
        warning: `Inverse conversion failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── Verification ─────────────────────────────────────────────────────────

/**
 * Verify Helmert transformation parameters against their common points.
 *
 * For each common point, this applies the forward transformation to the
 * Cassini coordinates and computes the residual (difference) from the
 * known UTM coordinates. Small residuals indicate a good fit.
 *
 * @param params - Helmert transformation parameters to verify
 * @returns Array of verification results with residuals in metres
 *
 * @example
 * ```ts
 * const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')!
 * const results = verifyWithCommonPoints(sheet)
 * results.forEach(r => {
 *   console.log(`${r.station}: dE=${r.residualE.toFixed(4)}m, dN=${r.residualN.toFixed(4)}m`)
 * })
 * ```
 */
export function verifyWithCommonPoints(params: TopoSheetParams): VerificationResult[] {
  return params.commonPoints.map((cp) => {
    const points = cassiniFeetToUTM(
      [{ id: cp.station, easting: cp.cassE, northing: cp.cassN }],
      params,
    )

    const computed = points[0]

    return {
      station: cp.station,
      expectedE: cp.utmE,
      computedE: computed.utmE,
      residualE: Math.round((computed.utmE - cp.utmE) * 1000) / 1000,
      expectedN: cp.utmN,
      computedN: computed.utmN,
      residualN: Math.round((computed.utmN - cp.utmN) * 1000) / 1000,
    }
  })
}

// ─── WGS84 Geographic Output ─────────────────────────────────────────────

/**
 * Convert UTM coordinates (Zone 37S) to WGS84 latitude/longitude.
 *
 * ⚠️ This uses proj4 for the UTM→WGS84 conversion. The UTM coordinates
 * output by the Helmert transform are on Arc 1960 datum (Clarke 1880).
 * This function treats them as WGS84 UTM, which introduces a small datum
 * shift (~10–30 m across Kenya). For sub-metre accuracy, use a full
 * 7-parameter datum transformation (Arc 1960 → WGS84).
 *
 * @param utmE - UTM easting in metres
 * @param utmN - UTM northing in metres
 * @returns WGS84 latitude/longitude in decimal degrees
 */
export function utmToWGS84(utmE: number, utmN: number): { lat: number; lon: number } {
  const [lon, lat] = proj4(UTM37S_DEF, WGS84_DEF, [utmE, utmN])
  return { lat, lon }
}

/**
 * Convert a decimal degree value to Degrees-Minutes-Seconds string.
 *
 * @param decimal - Decimal degree value (positive = N or E)
 * @param isLat - true for latitude (N/S), false for longitude (E/W)
 * @returns Formatted DMS string, e.g. "01° 26' 23.45" S"
 */
export function toDMS(decimal: number, isLat: boolean): string {
  const abs = Math.abs(decimal)
  const deg = Math.floor(abs)
  const minFloat = (abs - deg) * 60
  const min = Math.floor(minFloat)
  const sec = ((minFloat - min) * 60).toFixed(2)
  const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W')
  return `${String(deg).padStart(2, '0')}° ${String(min).padStart(2, '0')}' ${sec.padStart(5, ' ')}" ${dir}`
}

// ─── Accuracy Estimation ──────────────────────────────────────────────────

/**
 * Estimate the residual accuracy of Helmert parameters for a sheet.
 *
 * Uses the common control points to compute residuals (differences between
 * known and computed UTM coordinates), then calculates RMSE (Root Mean
 * Square Error) as a quality metric.
 *
 * @param params - Topo sheet parameters with common points
 * @returns Accuracy metrics: RMSE in metres and millimetres, plus a grade
 *
 * @example
 * ```ts
 * const sheet = KENYA_TOPO_SHEETS.find(s => s.id === '148/1')!
 * const acc = estimateSheetAccuracy(sheet)
 * console.log(acc.grade)  // e.g. 'EXCELLENT'
 * console.log(acc.rmseMM) // e.g. 5.2 mm
 * ```
 */
export function estimateSheetAccuracy(params: TopoSheetParams): { rmseM: number; rmseMM: number; grade: string } {
  if (params.commonPoints.length < 2) {
    return { rmseM: NaN, rmseMM: NaN, grade: 'UNKNOWN' }
  }
  const verifications = verifyWithCommonPoints(params)
  const ssr = verifications.reduce((s, v) => s + v.residualE ** 2 + v.residualN ** 2, 0)
  const n = verifications.length
  const dof = n > 2 ? n - 1 : n // simple DOF
  const rmseM = Math.sqrt(ssr / (2 * dof)) // 2 coords per point
  const rmseMM = rmseM * 1000
  const grade = rmseMM <= 10 ? 'EXCELLENT' : rmseMM <= 100 ? 'GOOD' : rmseMM <= 1000 ? 'MODERATE' : 'LOW'
  return { rmseM: Math.round(rmseM * 10000) / 10000, rmseMM: Math.round(rmseMM * 10) / 10, grade }
}

// ─── Convenience: Find sheet by ID ────────────────────────────────────────

/**
 * Find a topographic sheet's parameters by its ID (e.g. "148/1").
 * Returns the first match or undefined if not found.
 *
 * @param sheetId - Sheet identifier string
 * @returns TopoSheetParams if found, undefined otherwise
 */
export function findTopoSheet(sheetId: string): TopoSheetParams | undefined {
  return KENYA_TOPO_SHEETS.find((s) => s.id === sheetId)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXTENDED TRANSFORMATION METHODS (Affine 6-param, Poly 12-param, Sub-sheets)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Extended Type Definitions ──────────────────────────────────────────────

/** Transformation method selector */
export type TransformMethod = 'helmert4' | 'affine6' | 'poly12'

/** 6-param affine transformation (Rainsford step 1) */
export interface Affine6Params {
  id: string
  name: string
  method: 'affine6'
  a: number; b: number; c: number   // easting: E_utm = a + b*cassX + c*cassY
  d: number; e: number; f: number   // northing: N_utm = d + e*cassX + f*cassY
  commonPoints: CommonPoint[]
}

/** 12-param quadratic polynomial (Rainsford full) */
export interface Poly12Params {
  id: string
  name: string
  method: 'poly12'
  a: number; b: number; c: number; l: number; m: number; n: number  // easting
  d: number; e: number; f: number; p: number; q: number; r: number   // northing
  commonPoints: CommonPoint[]
}

/** A sub-sheet corner point */
export interface CornerPoint {
  cassX: number
  cassY: number
  utmE: number
  utmN: number
}

/** Sub-sheet definition with auto-computed parameters */
export interface SubSheetDef {
  sheetId: string         // e.g. "88_2"
  subId: string           // e.g. "5"
  fullId: string          // e.g. "88_2/5"
  corners: CornerPoint[]  // 4 corner points
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  helmertParams: TopoSheetParams
  affineParams: Affine6Params
}

// ─── Sub-sheet Corner Data Import ───────────────────────────────────────────

import SUBSHEET_CORNERS_RAW from './subsheet_corners.json'

type SubSheetCornersJSON = Record<string, Record<string, { cassX: number; cassY: number; utmE: number; utmN: number }[]>>

// ─── General NxN Gaussian Elimination ───────────────────────────────────────

/**
 * Solve an NxN linear system Ax = b using Gaussian elimination with partial pivoting.
 * @param A - NxN matrix
 * @param b - N-length observation vector
 * @returns Solution vector x
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length
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
      throw new Error(`Singular matrix at column ${col} in linear solve`)
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

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j]
    }
    x[i] = sum / aug[i][i]
  }
  return x
}

/**
 * Solve a least-squares problem: given an overdetermined system A·x ≈ b,
 * solve (A^T·A)·x = A^T·b via normal equations.
 * @param A - m×n design matrix (m >= n)
 * @param b - m-length observation vector
 * @returns Solution vector x of length n
 */
function solveLeastSquares(A: number[][], b: number[]): number[] {
  const m = A.length
  const n = A[0].length
  const ATA = Array.from({ length: n }, () => new Array(n).fill(0))
  const ATb = new Array(n).fill(0)

  for (let r = 0; r < m; r++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ATA[i][j] += A[r][i] * A[r][j]
      }
      ATb[i] += A[r][i] * b[r]
    }
  }
  return solveLinearSystem(ATA, ATb)
}

// ─── 6-Param Affine Solver ─────────────────────────────────────────────────

/**
 * Compute 6-parameter affine transformation from common points (Rainsford step 1).
 *
 * E_utm = a + b·cassE + c·cassN
 * N_utm = d + e·cassE + f·cassN
 *
 * Uses raw Cassini coordinates (no conformal correction) — the polynomial
 * absorbs the distortion.
 *
 * @param commonPoints - Array of at least 3 common points
 * @returns Affine6Params with computed coefficients
 */
export function computeAffine6Params(commonPoints: CommonPoint[]): Affine6Params {
  if (commonPoints.length < 3) {
    throw new Error(`computeAffine6Params requires at least 3 common points; got ${commonPoints.length}`)
  }

  // Design matrix: [1, cassE, cassN] for each point
  const A = commonPoints.map(cp => [1, cp.cassE, cp.cassN])

  // Solve for easting coefficients (a, b, c)
  const bE = commonPoints.map(cp => cp.utmE)
  const xE = solveLeastSquares(A, bE)

  // Solve for northing coefficients (d, e, f)
  const bN = commonPoints.map(cp => cp.utmN)
  const xN = solveLeastSquares(A, bN)

  return {
    id: 'computed-affine6',
    name: 'Computed Affine 6-Param',
    method: 'affine6',
    a: xE[0], b: xE[1], c: xE[2],
    d: xN[0], e: xN[1], f: xN[2],
    commonPoints,
  }
}

// ─── 12-Param Quadratic Polynomial Solver ──────────────────────────────────

/**
 * Compute 12-parameter quadratic polynomial transformation from common points (Rainsford full).
 *
 * E_utm = a + b·x + c·y + l·x² + m·y² + n·x·y
 * N_utm = d + e·x + f·y + p·x² + q·y² + r·x·y
 *
 * Needs at least 6 common points. Uses raw Cassini coordinates.
 *
 * @param commonPoints - Array of at least 6 common points
 * @returns Poly12Params with computed coefficients
 */
export function computePoly12Params(commonPoints: CommonPoint[]): Poly12Params {
  if (commonPoints.length < 6) {
    throw new Error(`computePoly12Params requires at least 6 common points; got ${commonPoints.length}`)
  }

  // Design matrix: [1, x, y, x², y², x·y] for each point
  const A = commonPoints.map(cp => {
    const x = cp.cassE
    const y = cp.cassN
    return [1, x, y, x * x, y * y, x * y]
  })

  const bE = commonPoints.map(cp => cp.utmE)
  const xE = solveLeastSquares(A, bE)

  const bN = commonPoints.map(cp => cp.utmN)
  const xN = solveLeastSquares(A, bN)

  return {
    id: 'computed-poly12',
    name: 'Computed Poly 12-Param',
    method: 'poly12',
    a: xE[0], b: xE[1], c: xE[2], l: xE[3], m: xE[4], n: xE[5],
    d: xN[0], e: xN[1], f: xN[2], p: xN[3], q: xN[4], r: xN[5],
    commonPoints,
  }
}

// ─── Build Sub-sheet Definitions ───────────────────────────────────────────

/**
 * Build SubSheetDef array from the imported corner data.
 * For each sub-sheet, computes Helmert 4-param and Affine 6-param from the 4 corners.
 */
function buildSubSheets(): SubSheetDef[] {
  const raw = SUBSHEET_CORNERS_RAW as unknown as SubSheetCornersJSON
  const result: SubSheetDef[] = []

  for (const sheetId of Object.keys(raw)) {
    const subs = raw[sheetId]
    for (const subId of Object.keys(subs)) {
      const corners = subs[subId]

      // Skip sub-sheets with fewer than 3 unique corners (degenerate)
      if (corners.length < 3) continue

      // Compute bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const c of corners) {
        if (c.cassX < minX) minX = c.cassX
        if (c.cassX > maxX) maxX = c.cassX
        if (c.cassY < minY) minY = c.cassY
        if (c.cassY > maxY) maxY = c.cassY
      }

      // Build CommonPoints from corners
      // cassE = cassX, cassN = cassY (positive values for these sheets)
      const cp: CommonPoint[] = corners.map((c, i) => ({
        station: `${sheetId}/${subId}/C${i + 1}`,
        cassN: c.cassY,
        cassE: c.cassX,
        utmN: c.utmN,
        utmE: c.utmE,
      }))

      const fullId = `${sheetId}/${subId}`

      try {
        // Compute Helmert 4-param from corners
        const helmertRaw = computeHelmert4Params(cp)
        const helmertParams: TopoSheetParams = {
          id: fullId,
          name: `Sub-sheet ${fullId} (Helmert)`,
          description: `Auto-computed Helmert 4-param from ${cp.length} corners.`,
          P: helmertRaw.P,
          Q: helmertRaw.Q,
          Cx: helmertRaw.Cx,
          Cy: helmertRaw.Cy,
          commonPoints: cp,
        }

        // Compute Affine 6-param from corners
        const affineParams = computeAffine6Params(cp)
        affineParams.id = fullId
        affineParams.name = `Sub-sheet ${fullId} (Affine)`

        result.push({
          sheetId,
          subId,
          fullId,
          corners,
          bounds: { minX, maxX, minY, maxY },
          helmertParams,
          affineParams,
        })
      } catch {
        // Skip sub-sheets with degenerate geometry (singular matrix, etc.)
      }
    }
  }

  return result
}

/**
 * Pre-computed sub-sheet definitions for Kenyan topo sheets 75/3, 88/2, 88/4.
 * Each sub-sheet has auto-computed Helmert 4-param and Affine 6-param parameters
 * derived from its 4 corner points, giving near-zero residuals (EXCELLENT accuracy).
 */
export const KENYA_SUB_SHEETS: SubSheetDef[] = buildSubSheets()

/** Set of topo sheet IDs that have sub-sheet definitions */
export const SHEETS_WITH_SUBSHEETS = new Set(KENYA_SUB_SHEETS.map(ss => ss.sheetId))

// ─── Sub-sheet Auto-detection ──────────────────────────────────────────────

/**
 * Find which sub-sheet a Cassini point falls within, using bounding box check.
 *
 * @param sheetId - The parent topo sheet ID (e.g. "75_3", "88_2", "88_4")
 * @param cassX - Cassini easting (feet)
 * @param cassY - Cassini northing (feet, positive for sub-sheet sheets)
 * @returns The matching SubSheetDef, or undefined if not found
 */
export function findSubSheet(sheetId: string, cassX: number, cassY: number): SubSheetDef | undefined {
  const subsForSheet = KENYA_SUB_SHEETS.filter(ss => ss.sheetId === sheetId)
  for (const ss of subsForSheet) {
    const { minX, maxX, minY, maxY } = ss.bounds
    if (cassX >= minX && cassX <= maxX && cassY >= minY && cassY <= maxY) {
      return ss
    }
  }
  return undefined
}

// ─── Universal Forward Conversion ───────────────────────────────────────────

/**
 * Convert Cassini-Soldner coordinates (FEET) to UTM coordinates (METRES) using
 * any supported parameter type.
 *
 * - TopoSheetParams: Uses Helmert 4-param with conformal correction
 * - Affine6Params: Uses 6-param affine on raw Cassini coords
 * - Poly12Params: Uses 12-param quadratic on raw Cassini coords
 * - SubSheetDef: Uses its Helmert 4-param params
 *
 * @param points - Array of Cassini coordinates in FEET
 * @param params - Transformation parameters (any supported type)
 * @param method - Override method (optional)
 * @returns Array of conversion results
 */
export function convertCassiniToUTM(
  points: CassiniFeetPoint[],
  params: TopoSheetParams | Affine6Params | Poly12Params | SubSheetDef,
  method?: TransformMethod,
): ConversionResult[] {
  // Resolve SubSheetDef — default to affine6 (more accurate per-sub-sheet)
  if ('fullId' in params) {
    const m = method ?? 'affine6'
    if (m === 'affine6') return convertCassiniToUTM(points, params.affineParams, 'affine6')
    return convertCassiniToUTM(points, params.helmertParams, 'helmert4')
  }

  // Affine 6-param: works on raw Cassini (no conformal correction)
  if ('method' in params && params.method === 'affine6') {
    const p = params as Affine6Params
    return points.map(pt => {
      try {
        const cassE = pt.easting
        const cassN = pt.northing
        const utmE = p.a + p.b * cassE + p.c * cassN
        const utmN = p.d + p.e * cassE + p.f * cassN
        return {
          id: pt.id,
          cassiniE: Math.round(cassE * 10) / 10,
          cassiniN: Math.round(cassN * 10) / 10,
          conformalE: Math.round(applyConformalCorrection(cassE) * 10) / 10,
          utmE: Math.round(utmE * 1000) / 1000,
          utmN: Math.round(utmN * 1000) / 1000,
        }
      } catch (err) {
        return {
          id: pt.id,
          cassiniE: pt.easting,
          cassiniN: pt.northing,
          conformalE: applyConformalCorrection(pt.easting),
          utmE: 0, utmN: 0,
          warning: `Affine conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    })
  }

  // Poly 12-param: works on raw Cassini (no conformal correction)
  if ('method' in params && params.method === 'poly12') {
    const p = params as Poly12Params
    return points.map(pt => {
      try {
        const x = pt.easting
        const y = pt.northing
        const utmE = p.a + p.b * x + p.c * y + p.l * x * x + p.m * y * y + p.n * x * y
        const utmN = p.d + p.e * x + p.f * y + p.p * x * x + p.q * y * y + p.r * x * y
        return {
          id: pt.id,
          cassiniE: Math.round(x * 10) / 10,
          cassiniN: Math.round(y * 10) / 10,
          conformalE: Math.round(applyConformalCorrection(x) * 10) / 10,
          utmE: Math.round(utmE * 1000) / 1000,
          utmN: Math.round(utmN * 1000) / 1000,
        }
      } catch (err) {
        return {
          id: pt.id,
          cassiniE: pt.easting,
          cassiniN: pt.northing,
          conformalE: applyConformalCorrection(pt.easting),
          utmE: 0, utmN: 0,
          warning: `Poly conversion failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    })
  }

  // Helmert 4-param (default): use existing function with conformal correction
  return cassiniFeetToUTM(points, params as TopoSheetParams)
}

// ─── Universal Inverse Conversion ───────────────────────────────────────────

/**
 * Convert UTM coordinates (METRES) back to Cassini-Soldner coordinates (FEET)
 * using any supported parameter type.
 *
 * @param points - Array of UTM coordinates in METRES
 * @param params - Transformation parameters (any supported type)
 * @param method - Override method (optional)
 * @returns Array of conversion results
 */
export function convertUTMToCassini(
  points: UTMPoint[],
  params: TopoSheetParams | Affine6Params | Poly12Params | SubSheetDef,
  method?: TransformMethod,
): ConversionResult[] {
  // Resolve SubSheetDef — default to affine6 (more accurate per-sub-sheet)
  if ('fullId' in params) {
    const m = method ?? 'affine6'
    if (m === 'affine6') return convertUTMToCassini(points, params.affineParams, 'affine6')
    return convertUTMToCassini(points, params.helmertParams, 'helmert4')
  }

  // Affine 6-param inverse: solve [a,b,c; d,e,f] · [1,E,N]^T for E,N
  if ('method' in params && params.method === 'affine6') {
    const p = params as Affine6Params
    return points.map(pt => {
      try {
        const utmE = pt.easting
        const utmN = pt.northing

        // Remove constant terms
        const dE = utmE - p.a
        const dN = utmN - p.d

        // Invert the 2x2: [b c; e f]
        const det = p.b * p.f - p.c * p.e
        if (Math.abs(det) < 1e-20) {
          throw new Error('Singular affine matrix')
        }
        const cassE = (p.f * dE - p.c * dN) / det
        const cassN = (-p.e * dE + p.b * dN) / det

        return {
          id: pt.id,
          cassiniE: Math.round(cassE * 10) / 10,
          cassiniN: Math.round(cassN * 10) / 10,
          conformalE: Math.round(applyConformalCorrection(cassE) * 10) / 10,
          utmE: Math.round(utmE * 1000) / 1000,
          utmN: Math.round(utmN * 1000) / 1000,
        }
      } catch (err) {
        return {
          id: pt.id,
          cassiniE: 0, cassiniN: 0, conformalE: 0,
          utmE: pt.easting, utmN: pt.northing,
          warning: `Affine inverse failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    })
  }

  // Poly 12-param inverse: iterative Newton-Raphson
  if ('method' in params && params.method === 'poly12') {
    const p = params as Poly12Params
    return points.map(pt => {
      try {
        const targetE = pt.easting
        const targetN = pt.northing

        // Initial guess: use affine approximation (ignore quadratic terms)
        const det0 = p.b * p.f - p.c * p.e
        if (Math.abs(det0) < 1e-20) throw new Error('Singular poly matrix (linear part)')
        let cassE = (p.f * (targetE - p.a) - p.c * (targetN - p.d)) / det0
        let cassN = (-p.e * (targetE - p.a) + p.b * (targetN - p.d)) / det0

        // Newton-Raphson iterations (at most 10)
        for (let iter = 0; iter < 10; iter++) {
          // Compute forward with current guess
          const x = cassE, y = cassN
          const fwdE = p.a + p.b * x + p.c * y + p.l * x * x + p.m * y * y + p.n * x * y
          const fwdN = p.d + p.e * x + p.f * y + p.p * x * x + p.q * y * y + p.r * x * y

          // Residuals
          const resE = targetE - fwdE
          const resN = targetN - fwdN

          // Check convergence
          if (Math.abs(resE) < 1e-6 && Math.abs(resN) < 1e-6) break

          // Jacobian: d(E)/d(x), d(E)/d(y), d(N)/d(x), d(N)/d(y)
          const J = [
            [p.b + 2 * p.l * x + p.n * y, p.c + 2 * p.m * y + p.n * x],
            [p.e + 2 * p.p * x + p.r * y, p.f + 2 * p.q * y + p.r * x],
          ]
          const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0]
          if (Math.abs(detJ) < 1e-20) throw new Error('Singular Jacobian in poly inverse')

          cassE += (J[1][1] * resE - J[0][1] * resN) / detJ
          cassN += (-J[1][0] * resE + J[0][0] * resN) / detJ
        }

        return {
          id: pt.id,
          cassiniE: Math.round(cassE * 10) / 10,
          cassiniN: Math.round(cassN * 10) / 10,
          conformalE: Math.round(applyConformalCorrection(cassE) * 10) / 10,
          utmE: Math.round(targetE * 1000) / 1000,
          utmN: Math.round(targetN * 1000) / 1000,
        }
      } catch (err) {
        return {
          id: pt.id,
          cassiniE: 0, cassiniN: 0, conformalE: 0,
          utmE: pt.easting, utmN: pt.northing,
          warning: `Poly inverse failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    })
  }

  // Helmert 4-param (default): use existing inverse function
  return utmToCassiniFeet(points, params as TopoSheetParams)
}

// ─── Sub-sheet Accuracy Estimation ─────────────────────────────────────────

/**
 * Estimate accuracy of a sub-sheet's Helmert transformation.
 * With 4 corners and 4 Helmert params → exact fit → residual should be ~0mm.
 *
 * @param subSheet - Sub-sheet definition
 * @returns RMSE in mm and accuracy grade
 */
export function estimateSubSheetAccuracy(subSheet: SubSheetDef): { rmseMM: number; grade: string } {
  try {
    const acc = estimateSheetAccuracy(subSheet.helmertParams)
    return { rmseMM: acc.rmseMM, grade: acc.grade }
  } catch {
    return { rmseMM: NaN, grade: 'UNKNOWN' }
  }
}

// ─── Verify Affine6 Params ──────────────────────────────────────────────────

/**
 * Verify affine 6-param transformation against common points.
 */
export function verifyAffine6Params(params: Affine6Params): VerificationResult[] {
  return params.commonPoints.map(cp => {
    const computedE = params.a + params.b * cp.cassE + params.c * cp.cassN
    const computedN = params.d + params.e * cp.cassE + params.f * cp.cassN
    return {
      station: cp.station,
      expectedE: cp.utmE,
      computedE: Math.round(computedE * 1000) / 1000,
      residualE: Math.round((computedE - cp.utmE) * 1000) / 1000,
      expectedN: cp.utmN,
      computedN: Math.round(computedN * 1000) / 1000,
      residualN: Math.round((computedN - cp.utmN) * 1000) / 1000,
    }
  })
}

// ─── Verify Poly12 Params ──────────────────────────────────────────────────

/**
 * Verify poly 12-param transformation against common points.
 */
export function verifyPoly12Params(params: Poly12Params): VerificationResult[] {
  return params.commonPoints.map(cp => {
    const x = cp.cassE, y = cp.cassN
    const computedE = params.a + params.b * x + params.c * y + params.l * x * x + params.m * y * y + params.n * x * y
    const computedN = params.d + params.e * x + params.f * y + params.p * x * x + params.q * y * y + params.r * x * y
    return {
      station: cp.station,
      expectedE: cp.utmE,
      computedE: Math.round(computedE * 1000) / 1000,
      residualE: Math.round((computedE - cp.utmE) * 1000) / 1000,
      expectedN: cp.utmN,
      computedN: Math.round(computedN * 1000) / 1000,
      residualN: Math.round((computedN - cp.utmN) * 1000) / 1000,
    }
  })
}
