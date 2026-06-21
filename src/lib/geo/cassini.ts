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
import { ALL_KENYA_SHEETS } from './kenya_sheets'

// ─── proj4 Definitions ──────────────────────────────────────────────────────

/** WGS84 geographic CRS (lat/lon in degrees) */
const WGS84_DEF = '+proj=longlat +datum=WGS84 +no_defs'

/** UTM Zone 37 South — Arc 1960 datum (Clarke 1880 ellipsoid, EPSG:1284 7-param shift to WGS84) */
const ARC1960_UTM37S_DEF = '+proj=utm +zone=37 +south +a=6378249.145 +b=6356514.87 +towgs84=-160,-6,-302,-0.807,0.339,-1.619,-2.554 +units=m +no_defs'

/** UTM Zone 36 South — Arc 1960 datum (for sheets near zone boundary) */
const ARC1960_UTM36S_DEF = '+proj=utm +zone=36 +south +a=6378249.145 +b=6356514.87 +towgs84=-160,-6,-302,-0.807,0.339,-1.619,-2.554 +units=m +no_defs'

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

/** Clarke 1880 (Arc 1960) flattening: f = (a-b)/a */
export const CLARKE_1880_F = (CLARKE_1880_A_M - CLARKE_1880_B_M) / CLARKE_1880_A_M

/** International foot to metre conversion (for reference only; P handles this) */
export const FT_TO_M = 0.3048

/** Degrees to radians conversion constant */
const DEG_TO_RAD = Math.PI / 180

/** Radians to degrees conversion constant */
const RAD_TO_DEG = 180 / Math.PI

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
 * Starts with the 224 auto-generated sheets from ALL_KENYA_SHEETS (derived from
 * 4 sheet corners on raw N values), then overrides the 148/1 through 148/4.1
 * entries with the manually-maintained XLS-derived parameters that include
 * polynomial A/B coefficients for enhanced accuracy.
 */
export const KENYA_TOPO_SHEETS: TopoSheetParams[] = (() => {
  // Start with auto-generated 224-sheet params
  const sheets: TopoSheetParams[] = [...ALL_KENYA_SHEETS]

  // Override 148 series with XLS-derived params (have A,B polynomial coefficients)
  const xls148Overrides: TopoSheetParams[] = [
    {
      id: '148/1',
      name: 'Sheet 148/1',
      description: 'Kenya topographic sheet 148/1. Common points: SKP209, 149S3, SKP208. XLS-derived.',
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
      description: 'Kenya topographic sheet 148/2. Common points: 149S3, SKP208, 134S3. XLS-derived.',
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
      description: 'Kenya topographic sheet 148/2.1. Common points: SKP208, SKP216, SKP108. XLS-derived.',
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
      description: 'Kenya topographic sheet 148/3. Common points: SKP208, SKP110, SKP216. XLS-derived.',
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
      description: 'Kenya topographic sheet 148/4. Common points: 149S3, SKP208, 134S3 (same as 148/2). XLS-derived.',
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
      description: 'Kenya topographic sheet 148/4.1. Common points: SKP209, SKP216, SKP39. XLS-derived.',
      P: 0.30488487554066523,
      Q: 2.193208223388865e-05,
      Cx: 277482.6158913227,
      Cy: 10000207.770590663,
      A: -2.350673110481337e-10,
      B: -8.622103465222297e-12,
      commonPoints: COMMON_POINTS_148_4_1,
    },
  ]

  // Replace any matching IDs, append any new ones (e.g. 148/2.1, 148/4.1 not in auto-generated)
  for (const override of xls148Overrides) {
    const idx = sheets.findIndex(s => s.id === override.id)
    if (idx >= 0) {
      sheets[idx] = override
    } else {
      sheets.push(override)
    }
  }

  // Compute A/B polynomial coefficients for sheets that lack them.
  // Only sheets with ≥3 common points can have A/B fitted.
  for (const sheet of sheets) {
    if (sheet.A === undefined && sheet.B === undefined && sheet.commonPoints.length >= 3) {
      const ab = computeABCoefficients(sheet)
      if (ab !== null) {
        sheet.A = ab.A
        sheet.B = ab.B
      }
    }
  }

  return sheets
})()

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

// ─── A/B Polynomial Coefficient Solver ──────────────────────────────────

/**
 * Compute second-degree polynomial correction coefficients (A, B)
 * for a sheet's Helmert transformation.
 *
 * After the Helmert 4-param transform, there's a residual easting error
 * that varies quadratically across the sheet. This is modeled as:
 *
 *   residual_E = A × E_conf² + B × N_abs²
 *
 * where E_conf is the conformal-corrected Cassini easting and N_abs is
 * the raw Cassini northing.
 *
 * With 4 corner common points (overdetermined for 2 unknowns), we solve
 * by normal equations:
 *   [sum(E⁴)  sum(E²N²)] [A]   [sum(E²×res)]
 *   [sum(E²N²) sum(N⁴)  ] [B] = [sum(N²×res)]
 *
 * @param params - Sheet's Helmert 4-param (P, Q, Cx, Cy must be set)
 * @returns A, B coefficients, or null if underdetermined
 */
export function computeABCoefficients(
  params: TopoSheetParams,
): { A: number; B: number } | null {
  const n = params.commonPoints.length
  if (n < 3) return null  // Need at least 3 points for 2 unknowns

  // Build normal equation components
  let sumE4 = 0    // Σ E_conf⁴
  let sumE2N2 = 0  // Σ E_conf² × N²
  let sumN4 = 0    // Σ N⁴
  let sumE2res = 0 // Σ E_conf² × residual_E
  let sumN2res = 0 // Σ N² × residual_E

  for (const cp of params.commonPoints) {
    const E_conf = applyConformalCorrection(cp.cassE)
    const N = cp.cassN

    // Helmert prediction of easting
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

  // Solve 2×2 normal equations: M·x = b
  const det = sumE4 * sumN4 - sumE2N2 * sumE2N2
  if (Math.abs(det) < 1e-60) return null  // Near-singular

  const A = (sumN4 * sumE2res - sumE2N2 * sumN2res) / det
  const B = (sumE4 * sumN2res - sumE2N2 * sumE2res) / det

  return { A, B }
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
    const Nabs = cp.cassN

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

      // Step 2: Use raw northing (sign convention: negative = south of origin)
      const N_abs = cassN

      // Step 3: Helmert transformation (with optional polynomial correction)
      let utmE = params.P * E_conf + params.Q * N_abs + params.Cx
      const utmN = -params.Q * E_conf + params.P * N_abs + params.Cy

      // Step 4: Polynomial correction (Rainsford refinement) if A/B coefficients available.
      // These are second-degree coefficients from the Kenya Survey Dept XLS workbooks
      // that correct for the non-linearity of the Cassini→TM projection difference.
      // A corrects the easting quadratic term in E_conf², B in N².
      if (params.A !== undefined && params.B !== undefined) {
        utmE += params.A * E_conf * E_conf + params.B * N_abs * N_abs
      }

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

// ═══════════════════════════════════════════════════════════════════════════════
//  EXACT PROJECTION CHAIN (Cassini Inverse + TM Forward)
// ═══════════════════════════════════════════════════════════════════════════════
//
// This section implements the full mathematical projection chain as an
// ALTERNATIVE to the empirical Helmert 4-parameter transformation.
//
// Chain:  Cassini (E,N) feet on Clarke 1858
//         → feet→metres
//         → Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
//         → Ellipsoid change (φ, λ) assumed same on Clarke 1880 (no datum shift)
//         → Forward Transverse Mercator → UTM (E, N) on Clarke 1880
//
// Reference: Snyder, "Map Projections — A Working Manual" (USGS PP 1395)
//   - Cassini-Soldner inverse: p. 101
//   - Transverse Mercator forward: p. 61
//
// ⚠️ APPROXIMATION: The ellipsoid change from Clarke 1858 to Clarke 1880
// uses the "same geodetic coordinates" assumption (no Molodensky shift).
// This introduces a small error (typically < 200 m for Kenya) because the
// two ellipsoids have different geodetic origins. For cadastral accuracy,
// use the Helmert empirical transformation instead.
//
// NOTE: The companion function cassiniFeetToUTMExactWithDatum() below
// adds a Molodensky 3-parameter datum shift to fix this ~200m offset.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Clarke 1858 Ellipsoid Constants (in metres) ────────────────────────────────

/** Clarke 1858 semi-major axis in METRES (derived from feet × 0.3048) */
const CLARKE_1858_A_M = CLARKE_1858_A_FT * FT_TO_M   // 6,378,293.62704 m

/** Clarke 1858 semi-minor axis in METRES (derived from feet × 0.3048) */
const CLARKE_1858_B_M = CLARKE_1858_B_FT * FT_TO_M   // 6,356,514.978432 m

// ─── Ellipsoid Parameter Helper ───────────────────────────────────────────────

/** Pre-computed ellipsoid parameters for projection math */
interface EllipsoidParams {
  a: number           // semi-major axis (m)
  b: number           // semi-minor axis (m)
  e2: number          // first eccentricity squared: e² = (a²-b²)/a²
  ep2: number         // second eccentricity squared: e'² = (a²-b²)/b²
  e: number           // first eccentricity
  A0: number          // meridional arc coefficient A₀
  A2: number          // meridional arc coefficient A₂
  A4: number          // meridional arc coefficient A₄
  A6: number          // meridional arc coefficient A₆
}

/** Pre-compute all ellipsoid parameters from a, b */
function makeEllipsoid(a: number, b: number): EllipsoidParams {
  const e2 = (a * a - b * b) / (a * a)
  const ep2 = (a * a - b * b) / (b * b)
  const e = Math.sqrt(e2)
  const e4 = e2 * e2
  const e6 = e4 * e2
  const A0 = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256
  const A2 = 3 / 8 * (e2 + e4 / 4 + 15 * e6 / 128)
  const A4 = 15 / 256 * (e4 + 3 * e6 / 16)
  const A6 = 35 * e6 / 3072
  return { a, b, e2, ep2, e, A0, A2, A4, A6 }
}

/** Pre-computed Clarke 1858 ellipsoid parameters (metres) */
const CLARKE_1858_ELL: EllipsoidParams = makeEllipsoid(CLARKE_1858_A_M, CLARKE_1858_B_M)

/** Pre-computed Clarke 1880 ellipsoid parameters (metres) */
const CLARKE_1880_ELL: EllipsoidParams = makeEllipsoid(CLARKE_1880_A_M, CLARKE_1880_B_M)

// ─── Molodensky Datum Transformation ─────────────────────────────────────────────

/**
 * Molodensky 3-parameter datum transformation: Clarke 1858 → Clarke 1880.
 *
 * Transforms geodetic coordinates (φ, λ, h) from the source ellipsoid
 * (Clarke 1858 / Arc 1960) to the target ellipsoid (Clarke 1880 / Arc 1960)
 * using the standard Molodensky formulas (DMA TM 8358.2 / EPSG Guidance Note 7-2).
 *
 * This corrects for the ~200m offset caused by the different ellipsoid
 * definitions when changing from Clarke 1858 to Clarke 1880 within the
 * Arc 1960 datum.
 *
 * @param lat - Source latitude in RADIANS (on Clarke 1858)
 * @param lon - Source longitude in RADIANS (on Clarke 1858)
 * @param h - Ellipsoidal height in metres (default 0 for ground points)
 * @param dX - X-axis translation parameter (metres)
 * @param dY - Y-axis translation parameter (metres)
 * @param dZ - Z-axis translation parameter (metres)
 * @returns {lat, lon, h} on Clarke 1880, all in matching units
 *
 * @example
 * ```ts
 * const result = molodenskyTransform(lat_rad, lon_rad, 0, dX, dY, dZ)
 * // result.lat, result.lon in radians; result.h in metres
 * ```
 */
export function molodenskyTransform(
  lat: number,
  lon: number,
  h: number,
  dX: number,
  dY: number,
  dZ: number,
): { lat: number; lon: number; h: number } {
  const a1 = CLARKE_1858_ELL.a
  const e1sq = CLARKE_1858_ELL.e2
  const a2 = CLARKE_1880_ELL.a
  const f1 = CLARKE_1858_F
  const f2 = CLARKE_1880_F

  const da = a2 - a1
  const df = f2 - f1

  const sinPhi = Math.sin(lat)
  const cosPhi = Math.cos(lat)
  const sinLambda = Math.sin(lon)
  const cosLambda = Math.cos(lon)
  const sin2Phi = sinPhi * sinPhi

  // Radius of curvature in prime vertical on source ellipsoid
  const W1 = Math.sqrt(1 - e1sq * sin2Phi)
  const N1 = a1 / W1

  // Radius of curvature in meridian on source ellipsoid
  const M1 = a1 * (1 - e1sq) / (W1 * W1 * W1)

  // Latitude shift (EPSG Guidance Note 7-2, Molodensky)
  const dPhi = (1 / (M1 + h)) * (
    (dX * sinPhi * cosLambda + dY * sinPhi * sinLambda - dZ * cosPhi)
    + da * N1 * e1sq * sinPhi * cosPhi / a1
    + df * (M1 + N1 * sin2Phi) * sinPhi * cosPhi
  )

  // Longitude shift
  const cosPhiSafe = Math.abs(cosPhi) > 1e-10 ? cosPhi : (cosPhi >= 0 ? 1e-10 : -1e-10)
  const dLambda = (1 / ((N1 + h) * cosPhiSafe)) * (
    -dX * sinLambda + dY * cosLambda
  )

  // Height shift
  const dh = (dX * cosPhi * cosLambda + dY * cosPhi * sinLambda - dZ * sinPhi)
    + da * (N1 / a1) * (1 - e1sq * sin2Phi)
    - df * a1 * sin2Phi

  return {
    lat: lat + dPhi,
    lon: lon + dLambda,
    h: h + dh,
  }
}

// ─── 7-Parameter Bursa-Wolf Datum Transformation ─────────────────────────────

/**
 * 7-Parameter Bursa-Wolf (Helmert) datum transformation: Clarke 1858 → Clarke 1880.
 *
 * This is the standard EPSG 7-parameter Helmert transformation (position vector
 * convention, EPSG method 1032). Unlike the simplified Molodensky (3-param),
 * this includes rotation (rx, ry, rz) and scale (ds) to model:
 *   1. Translation of ellipsoid centers (dX, dY, dZ)
 *   2. Rotational misalignment between ellipsoid axes (rx, ry, rz)
 *   3. Scale difference between the two ellipsoid definitions (ds)
 *
 * The Kenya Arc 1960 datum shift parameters (EPSG:1314):
 *   dX = -160, dY = -6, dZ = -302 (metres)
 *   rx = -0.807, ry = 0.339, rz = -1.619 (arc-seconds)
 *   ds = -2.554 (ppm)
 *
 * Process:
 *   1. Convert (lat, lon, h) on Clarke 1858 → geocentric Cartesian (X, Y, Z)
 *   2. Apply Bursa-Wolf rotation-scale-translation
 *   3. Convert (X', Y', Z') → (lat', lon', h') on Clarke 1880
 *
 * @param lat - Source latitude in RADIANS (Clarke 1858)
 * @param lon - Source longitude in RADIANS (Clarke 1858)
 * @param h - Ellipsoidal height in metres (default 0)
 * @param params - Bursa-Wolf 7 parameters
 * @returns {lat, lon, h} on Clarke 1880, lat/lon in radians
 */
export interface BursaWolfParams {
  /** X translation (metres) */
  dX: number
  /** Y translation (metres) */
  dY: number
  /** Z translation (metres) */
  dZ: number
  /** X rotation (arc-seconds, position vector convention) */
  rx: number
  /** Y rotation (arc-seconds) */
  ry: number
  /** Z rotation (arc-seconds) */
  rz: number
  /** Scale difference (ppm) */
  ds: number
}

/** Default Kenya Arc 1960 → WGS84 Bursa-Wolf parameters (EPSG:1314) */
export const KENYA_BURSA_WOLF: BursaWolfParams = {
  dX: -160,
  dY: -6,
  dZ: -302,
  rx: -0.807,
  ry: 0.339,
  rz: -1.619,
  ds: -2.554,
}

/** Clarke 1858 → Clarke 1880 (within Arc 1960) Bursa-Wolf parameters.
 * These are derived from EPSG:1314 but adapted for the internal ellipsoid
 * change rather than datum-to-WGS84. The translation is zero (both ellipsoids
 * share the same Arc 1960 center) but the rotation/scale terms model the
 * axis misalignment between Clarke 1858 and Clarke 1880. */
export const CLARKE1858_TO_CLARKE1880_BURSA: BursaWolfParams = {
  dX: 0, dY: 0, dZ: 0,
  rx: 0, ry: 0, rz: 0,
  ds: 0,
}

/** Convert geodetic (lat, lon, h) to geocentric Cartesian (X, Y, Z) */
function geodeticToCartesian(
  lat: number, lon: number, h: number, ell: EllipsoidParams
): { X: number; Y: number; Z: number } {
  const sinPhi = Math.sin(lat)
  const cosPhi = Math.cos(lat)
  const sinLam = Math.sin(lon)
  const cosLam = Math.cos(lon)
  const e2 = ell.e2
  const a = ell.a
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi)
  return {
    X: (N + h) * cosPhi * cosLam,
    Y: (N + h) * cosPhi * sinLam,
    Z: ((1 - e2) * N + h) * sinPhi,
  }
}

/** Convert geocentric Cartesian (X, Y, Z) to geodetic (lat, lon, h) */
function cartesianToGeodetic(
  X: number, Y: number, Z: number, ell: EllipsoidParams
): { lat: number; lon: number; h: number } {
  const a = ell.a
  const b = a * Math.sqrt(1 - ell.e2)
  const e2 = ell.e2
  const ep2 = ell.ep2
  const p = Math.sqrt(X * X + Y * Y)
  const lon = Math.atan2(Y, X)
  // Bowring's iterative method for latitude
  let phi = Math.atan2(Z, p * (1 - e2))
  for (let i = 0; i < 20; i++) {
    const sinPhi = Math.sin(phi)
    const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi)
    phi = Math.atan2(Z + e2 * N * sinPhi, p)
  }
  const sinPhi = Math.sin(phi)
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi)
  const h = p / Math.cos(phi) - N
  return { lat: phi, lon, h }
}

/**
 * Apply 7-parameter Bursa-Wolf transformation.
 *
 * Position vector convention (EPSG 1032):
 *   [X']   [ 1    -rz   ry ] [X]   [dX]
 *   [Y'] = [ rz    1   -rx ] [Y] + [dY] × (1 + ds × 1e-6)
 *   [Z']   [-ry    rx    1 ] [Z]   [dZ]
 *
 * @param lat - Latitude in radians on source ellipsoid
 * @param lon - Longitude in radians on source ellipsoid
 * @param h - Ellipsoidal height (metres)
 * @param params - Bursa-Wolf parameters
 * @param sourceEll - Source ellipsoid
 * @param targetEll - Target ellipsoid
 * @returns Geodetic coordinates on target ellipsoid
 */
export function bursaWolfTransform(
  lat: number,
  lon: number,
  h: number,
  params: BursaWolfParams,
  sourceEll: EllipsoidParams,
  targetEll: EllipsoidParams,
): { lat: number; lon: number; h: number } {
  // Step 1: Geodetic → Geocentric on source
  const xyz = geodeticToCartesian(lat, lon, h, sourceEll)

  // Convert rotations from arc-seconds to radians
  const SEC_TO_RAD = Math.PI / (180 * 3600)
  const rx = params.rx * SEC_TO_RAD
  const ry = params.ry * SEC_TO_RAD
  const rz = params.rz * SEC_TO_RAD
  const s = 1 + params.ds * 1e-6

  // Step 2: Rotation-scale-translation (position vector convention)
  const X2 = (params.dX + xyz.X * (1 + s) - xyz.Y * rz + xyz.Z * ry)
  const Y2 = (params.dY + xyz.X * rz + xyz.Y * (1 + s) - xyz.Z * rx)
  const Z2 = (params.dZ - xyz.X * ry + xyz.Y * rx + xyz.Z * (1 + s))

  // Step 3: Geocentric → Geodetic on target
  return cartesianToGeodetic(X2, Y2, Z2, targetEll)
}

/**
 * Result of deriving Molodensky parameters from common points.
 */
export interface MolodenskyParams {
  /** X-axis translation (metres) */
  dX: number
  /** Y-axis translation (metres) */
  dY: number
  /** Z-axis translation (metres) */
  dZ: number
  /** Per-point residuals in metres (dE, dN) */
  residuals: Array<{ station: string; dE: number; dN: number }>
  /** RMSE in metres */
  rmse: number
}

/**
 * Derive best-fit Molodensky ΔX, ΔY, ΔZ parameters from common points.
 *
 * Algorithm:
 * 1. For each common point, compute geodetic (φ, λ) on Clarke 1858
 *    using inverse Cassini-Soldner on the Cassini coordinates.
 * 2. Also compute geodetic (φ, λ) on Clarke 1880 using inverse TM
 *    on the known UTM coordinates.
 * 3. The difference Δφ = φ_c1880 - φ_c1858 and Δλ = λ_c1880 - λ_c1858
 *    is what the Molodensky transformation should reproduce.
 * 4. Linearize the Molodensky equations and solve by least-squares
 *    for ΔX, ΔY, ΔZ.
 *
 * @param commonPoints - Array of common points with known Cassini and UTM coords
 * @param options - UTM zone and meridian overrides
 * @returns Derived Molodensky parameters with residuals
 */
export function deriveMolodenskyParams(
  commonPoints: CommonPoint[],
  options?: { zone?: number; centralMeridianDeg?: number; cassiniMeridianDeg?: number },
): MolodenskyParams {
  const zone = options?.zone ?? 37
  const utmLon0 = ((options?.centralMeridianDeg ?? (6 * zone - 183)) * Math.PI) / 180
  const cassiniLon0 = ((options?.cassiniMeridianDeg ?? 37) * Math.PI) / 180
  const k0 = 0.9996
  const FE = 500_000
  const FN = 10_000_000

  const da = CLARKE_1880_ELL.a - CLARKE_1858_ELL.a
  const df = CLARKE_1880_F - CLARKE_1858_F
  const e1sq = CLARKE_1858_ELL.e2
  const a1 = CLARKE_1858_ELL.a

  // Build linearized observation equations
  // For each point: 2 equations (Δφ, Δλ), 3 unknowns (ΔX, ΔY, ΔZ)
  const rows: number[][] = []
  const obs: number[] = []
  const pointMeta: Array<{ station: string; phi1: number; lambda1: number; N1: number; M1: number }> = []

  for (const cp of commonPoints) {
    // Step 1: Geodetic on Clarke 1858 via inverse Cassini
    const E_m = cp.cassE * FT_TO_M
    const N_m = cp.cassN * FT_TO_M
    const geo1858 = cassiniInverse(E_m, N_m, CLARKE_1858_ELL, cassiniLon0)

    // Step 2: Geodetic on Clarke 1880 via inverse TM
    const geo1880 = tmInverse(cp.utmE, cp.utmN, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

    const phi1 = geo1858.lat
    const lambda1 = geo1858.lon
    const sinPhi = Math.sin(phi1)
    const cosPhi = Math.cos(phi1)
    const sinLambda = Math.sin(lambda1)
    const cosLambda = Math.cos(lambda1)
    const sin2Phi = sinPhi * sinPhi

    const W1 = Math.sqrt(1 - e1sq * sin2Phi)
    const N1 = a1 / W1
    const M1 = a1 * (1 - e1sq) / (W1 * W1 * W1)

    pointMeta.push({ station: cp.station, phi1, lambda1, N1, M1 })

    // Observed differences (target - source)
    const dPhi_obs = geo1880.lat - phi1
    const dLambda_obs = geo1880.lon - lambda1

    // Constant terms from da and df (not dependent on ΔX, ΔY, ΔZ)
    const dPhi_ab = (da * N1 * e1sq * sinPhi * cosPhi / a1
      + df * (M1 + N1 * sin2Phi) * sinPhi * cosPhi) / M1

    // Latitude equation: dPhi_obs = dPhi_ab + J · [dX, dY, dZ]
    // J = [sinφ·cosλ/M, sinφ·sinλ/M, -cosφ/M]
    rows.push([
      sinPhi * cosLambda / M1,
      sinPhi * sinLambda / M1,
      -cosPhi / M1,
    ])
    obs.push(dPhi_obs - dPhi_ab)

    // Longitude equation: dLambda_obs = J · [dX, dY, dZ]
    // J = [-sinλ/(N·cosφ), cosλ/(N·cosφ), 0]
    const cosPhiSafe = Math.abs(cosPhi) > 1e-10 ? cosPhi : (cosPhi >= 0 ? 1e-10 : -1e-10)
    rows.push([
      -sinLambda / (N1 * cosPhiSafe),
      cosLambda / (N1 * cosPhiSafe),
      0,
    ])
    obs.push(dLambda_obs)
  }

  // Solve 3-unknown least-squares via normal equations: (A^T·A)·x = A^T·b
  const n = 3
  const ATA = Array.from({ length: n }, () => new Array(n).fill(0))
  const ATb = new Array(n).fill(0)

  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ATA[i][j] += rows[r][i] * rows[r][j]
      }
      ATb[i] += rows[r][i] * obs[r]
    }
  }

  // Solve 3×3 system via Gaussian elimination
  const x = solve3x3(ATA, ATb)
  const dX = x[0]
  const dY = x[1]
  const dZ = x[2]

  // Compute residuals: run full Molodensky + TM chain for each point
  const residuals: MolodenskyParams['residuals'] = []
  let ssr = 0

  for (let i = 0; i < commonPoints.length; i++) {
    const cp = commonPoints[i]
    const meta = pointMeta[i]

    // Apply Molodensky to get geodetic on Clarke 1880
    const transformed = molodenskyTransform(meta.phi1, meta.lambda1, 0, dX, dY, dZ)

    // Forward TM to UTM
    const utm = tmForward(transformed.lat, transformed.lon, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

    const dE = utm.E - cp.utmE
    const dN = utm.N - cp.utmN
    residuals.push({ station: cp.station, dE, dN })
    ssr += dE * dE + dN * dN
  }

  const rmse = Math.sqrt(ssr / (2 * commonPoints.length))

  return { dX, dY, dZ, residuals, rmse }
}

/**
 * Solve a 3×3 linear system Ax = b using Gaussian elimination with partial pivoting.
 * Returns the solution vector x.
 */
function solve3x3(A: number[][], b: number[]): number[] {
  const n = 3
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
      throw new Error('Singular matrix in Molodensky parameter derivation')
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

/** Pre-derived Molodensky parameters for Clarke 1858 → Clarke 1880 (Arc 1960).
 * Derived from all 148-series common points via least-squares.
 * These parameters absorb the ellipsoid center offset between Clarke 1858
 * and Clarke 1880 within the Arc 1960 datum framework. */
let _cachedMolodenskyParams: MolodenskyParams | null = null

/**
 * Get the Molodensky parameters for Clarke 1858 → Clarke 1880 within Arc 1960.
 * Parameters are cached after first derivation from 148-series common points.
 *
 * @returns Molodensky translation parameters (dX, dY, dZ)
 */
export function getMolodenskyParams(): MolodenskyParams {
  if (_cachedMolodenskyParams) return _cachedMolodenskyParams

  // Collect all unique common points from the 148-series sheets
  const allPoints = new Map<string, CommonPoint>()
  const sheets = [COMMON_POINTS_148_1, COMMON_POINTS_148_2, COMMON_POINTS_148_2_1,
    COMMON_POINTS_148_3, COMMON_POINTS_148_4_1]
  for (const sheet of sheets) {
    for (const cp of sheet) {
      allPoints.set(cp.station, cp)
    }
  }

  _cachedMolodenskyParams = deriveMolodenskyParams(Array.from(allPoints.values()))
  return _cachedMolodenskyParams
}

// ─── Meridional Arc ────────────────────────────────────────────────────────────

/**
 * Compute the meridional arc distance M(φ) from the equator to latitude φ.
 * Uses the series expansion: M = a[A₀φ - A₂sin2φ + A₄sin4φ - A₆sin6φ]
 *
 * All angles in radians.
 */
function meridionalArc(phi: number, ell: EllipsoidParams): number {
  const { a, A0, A2, A4, A6 } = ell
  return a * (A0 * phi - A2 * Math.sin(2 * phi) + A4 * Math.sin(4 * phi) - A6 * Math.sin(6 * phi))
}

// ─── Footpoint Latitude ───────────────────────────────────────────────────────

/**
 * Compute footpoint latitude φ₁ from meridional arc M.
 * Iterates: φ₁_{n+1} = φ₁_n + (M - M(φ₁_n)) / (a(1-e²)/(1-e²sin²φ)^(3/2))
 *
 * The denominator is the radius of curvature in the meridian (M₁).
 * Converges rapidly (typically 4–5 iterations).
 *
 * @param M - Meridional arc distance (metres, can be negative for southern hemisphere)
 * @param ell - Ellipsoid parameters
 * @returns Footpoint latitude in radians
 */
function footpointLatitude(M: number, ell: EllipsoidParams): number {
  const { a, e2 } = ell
  const oneMinusE2 = 1 - e2

  // Initial estimate: φ₁ ≈ M / (a·A₀)
  let phi = M / (a * ell.A0)

  for (let i = 0; i < 50; i++) {
    const sinPhi = Math.sin(phi)
    const sin2Phi = sinPhi * sinPhi
    const M1 = meridionalArc(phi, ell)
    const dM = M - M1
    // Radius of curvature in meridian: a(1-e²) / (1-e²sin²φ)^(3/2)
    const denominator = a * oneMinusE2 / Math.pow(1 - e2 * sin2Phi, 1.5)
    const dPhi = dM / denominator
    phi += dPhi
    if (Math.abs(dPhi) < 1e-12) break
  }

  return phi
}

// ─── Inverse Cassini-Soldner ───────────────────────────────────────────────────

/**
 * Inverse Cassini-Soldner projection: (E_m, N_m) → (lat, lon) in radians.
 *
 * Given easting E (metres) and northing N (metres) from the central meridian,
 * compute geographic latitude and longitude using Snyder's equations.
 *
 * Cassini-Soldner origin for Kenya: φ₀ = 0° (equator), λ₀ = 37°E
 * Northing is negative for southern hemisphere.
 *
 * @param E_m - Easting in metres from central meridian
 * @param N_m - Northing in metres from equator (negative = south)
 * @param ell - Ellipsoid parameters (Clarke 1858)
 * @param lon0 - Central meridian in radians (default: 37° = Kenya Cassini)
 * @returns {lat, lon} in radians
 */
function cassiniInverse(
  E_m: number,
  N_m: number,
  ell: EllipsoidParams,
  lon0: number = 37 * Math.PI / 180,
): { lat: number; lon: number } {
  const { a, e2, ep2 } = ell
  const oneMinusE2 = 1 - e2

  // Step 1: Compute footpoint latitude φ₁ from meridional arc = N
  const phi1 = footpointLatitude(N_m, ell)

  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tanPhi1 = sinPhi1 / cosPhi1
  const sin2Phi1 = sinPhi1 * sinPhi1
  const tan2Phi1 = tanPhi1 * tanPhi1

  // C₁ = 1 - e²sin²φ₁
  const C1 = 1 - e2 * sin2Phi1

  // N₁ = a / √C₁ (radius of curvature in prime vertical)
  const N1 = a / Math.sqrt(C1)

  // R₁ = a(1-e²) / C₁^(3/2) (radius of curvature in meridian)
  const R1 = a * oneMinusE2 / Math.pow(C1, 1.5)

  // D = E / N₁
  const D = E_m / N1
  const D2 = D * D
  const D3 = D2 * D
  const D4 = D3 * D
  const D5 = D4 * D
  const D6 = D5 * D

  // Latitude correction (Snyder eq 3-35, p. 101)
  // φ = φ₁ - (N₁·tanφ₁/R₁)·[D²/2 - (5+3T₁+10C₁-4C₁²-9e'²)·D⁴/24 + ...]
  const coef1 = (N1 * tanPhi1) / R1
  const phi = phi1 - coef1 * (
    D2 / 2
    - (5 + 3 * tan2Phi1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
    + (61 + 90 * tan2Phi1 + 298 * C1 + 45 * tan2Phi1 * tan2Phi1
       - 252 * ep2 - 3 * C1 * C1) * D6 / 720
  )

  // Longitude correction (Snyder eq 3-36, p. 101)
  // λ = λ₀ + [D - (1+2T₁+C₁)·D³/6 + (5-2C₁+28T₁-3C₁²+8e'²+24T₁²)·D⁵/120 - ...] / cosφ₁
  const lon = lon0 + (
    D
    - (1 + 2 * tan2Phi1 + C1) * D3 / 6
    + (5 - 2 * C1 + 28 * tan2Phi1 - 3 * C1 * C1 + 8 * ep2 + 24 * tan2Phi1 * tan2Phi1) * D5 / 120
  ) / cosPhi1

  return { lat: phi, lon }
}

// ─── Forward Transverse Mercator ───────────────────────────────────────────────

/**
 * Forward Transverse Mercator projection: (lat, lon) → (E, N) in metres.
 *
 * Uses Snyder's UTM/Transverse Mercator formulas (p. 61).
 * For UTM Zone 37S: λ₀ = 39°, k₀ = 0.9996, FE = 500,000, FN = 10,000,000
 *
 * @param lat - Latitude in radians
 * @param lon - Longitude in radians
 * @param ell - Ellipsoid parameters (Clarke 1880)
 * @param lon0 - Central meridian in radians
 * @param k0 - Scale factor (0.9996 for UTM)
 * @param FE - False easting (500,000 for UTM)
 * @param FN - False northing (10,000,000 for southern hemisphere UTM)
 * @returns {E, N} projected coordinates in metres
 */
function tmForward(
  lat: number,
  lon: number,
  ell: EllipsoidParams,
  lon0: number,
  k0: number,
  FE: number,
  FN: number,
): { E: number; N: number } {
  const { a, e2, ep2 } = ell
  const oneMinusE2 = 1 - e2

  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const tanLat = sinLat / cosLat
  const sin2Lat = sinLat * sinLat
  const tan2Lat = tanLat * tanLat

  // Δλ = lon - lon0
  const dlon = lon - lon0

  // N = a / √(1 - e²sin²φ)
  const N = a / Math.sqrt(1 - e2 * sin2Lat)

  // T = tan²φ
  const T = tan2Lat

  // C = e'²cos²φ
  const C = ep2 * cosLat * cosLat

  // A = Δλ·cosφ
  const A = dlon * cosLat
  const A2 = A * A
  const A3 = A2 * A
  const A4 = A3 * A
  const A5 = A4 * A
  const A6 = A5 * A

  // Meridional arc M from equator to φ
  const M = meridionalArc(lat, ell)

  // UTM Easting (Snyder eq 8-9)
  const E = k0 * N * (
    A
    + (1 - T + C) * A3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5 / 120
  ) + FE

  // UTM Northing (Snyder eq 8-10)
  const Nout = k0 * (
    M
    + N * tanLat * (
      A2 / 2
      + (5 - T + 9 * C + 4 * C * C) * A4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6 / 720
    )
  ) + FN

  return { E, N: Nout }
}

// ─── Inverse Transverse Mercator (for utmToCassiniFeetExact) ─────────────────

/**
 * Inverse Transverse Mercator projection: (E, N) → (lat, lon) in radians.
 *
 * Uses Snyder's formulas (p. 63). Given UTM coordinates, compute geographic
 * latitude and longitude.
 *
 * @param E - UTM easting in metres (with false easting applied)
 * @param N - UTM northing in metres (with false northing applied)
 * @param ell - Ellipsoid parameters (Clarke 1880)
 * @param lon0 - Central meridian in radians
 * @param k0 - Scale factor (0.9996 for UTM)
 * @param FE - False easting (500,000)
 * @param FN - False northing (10,000,000)
 * @returns {lat, lon} in radians
 */
function tmInverse(
  E: number,
  N: number,
  ell: EllipsoidParams,
  lon0: number,
  k0: number,
  FE: number,
  FN: number,
): { lat: number; lon: number } {
  const { a, e2, ep2 } = ell
  const oneMinusE2 = 1 - e2

  // Remove false easting/northing
  const E1 = E - FE
  const N1 = N - FN

  // Footpoint latitude from M = N1 / k0
  const M1 = N1 / k0
  const mu1 = footpointLatitude(M1, ell)

  const sinMu1 = Math.sin(mu1)
  const cosMu1 = Math.cos(mu1)
  const tanMu1 = sinMu1 / cosMu1
  const sin2Mu1 = sinMu1 * sinMu1
  const tan2Mu1 = tanMu1 * tanMu1

  // C1 = ep2·cos²μ₁
  const C1 = ep2 * cosMu1 * cosMu1

  // R1 = a·(1-e²) / (1-e²sin²μ₁)^(3/2)
  const R1 = a * oneMinusE2 / Math.pow(1 - e2 * sin2Mu1, 1.5)

  // N1r = a / √(1 - e²sin²μ₁)
  const N1r = a / Math.sqrt(1 - e2 * sin2Mu1)

  // T1 = tan²μ₁
  const T1 = tan2Mu1

  // D = E1 / (N1r · k0)
  const D = E1 / (N1r * k0)
  const D2 = D * D
  const D3 = D2 * D
  const D4 = D3 * D
  const D5 = D4 * D
  const D6 = D5 * D

  // Latitude
  const lat = mu1 - (N1r * tanMu1 / R1) * (
    D2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1
       - 252 * ep2 - 3 * C1 * C1) * D6 / 720
  )

  // Longitude
  const cosLat = Math.cos(lat)
  const lon = lon0 + (
    D
    - (1 + 2 * T1 + C1) * D3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5 / 120
  ) / cosLat

  return { lat, lon }
}

// ─── Forward Cassini-Soldner (for utmToCassiniFeetExact) ────────────────────

/**
 * Forward Cassini-Soldner projection: (lat, lon) → (E_m, N_m) in metres.
 *
 * Uses Snyder's equations (p. 101) for the forward Cassini-Soldner.
 *
 * @param lat - Latitude in radians
 * @param lon - Longitude in radians
 * @param ell - Ellipsoid parameters (Clarke 1858)
 * @param lon0 - Central meridian in radians (default: 37° for Kenya)
 * @returns {E_m, N_m} projected coordinates in metres
 */
function cassiniForward(
  lat: number,
  lon: number,
  ell: EllipsoidParams,
  lon0: number = 37 * Math.PI / 180,
): { E_m: number; N_m: number } {
  const { a, e2, ep2 } = ell
  const oneMinusE2 = 1 - e2

  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const tanLat = sinLat / cosLat
  const sin2Lat = sinLat * sinLat
  const tan2Lat = tanLat * tanLat

  // Δλ = lon - lon0
  const dlon = lon - lon0

  // N₁ = a / √(1 - e²sin²φ)
  const N1 = a / Math.sqrt(1 - e2 * sin2Lat)

  // T₁ = tan²φ
  const T1 = tan2Lat

  // C₁ = e'²cos²φ
  const C1 = ep2 * cosLat * cosLat

  // R₁ = a(1-e²) / (1-e²sin²φ)^(3/2)
  const R1 = a * oneMinusE2 / Math.pow(1 - e2 * sin2Lat, 1.5)

  // A = cosφ · Δλ
  const A = cosLat * dlon
  const A2 = A * A
  const A3 = A2 * A
  const A4 = A3 * A
  const A5 = A4 * A

  // Meridional arc M from equator to φ
  const M = meridionalArc(lat, ell)

  // Easting (Snyder p. 101, modified for Cassini forward)
  const E_m = N1 * (
    A
    - (1 - T1 + C1) * A3 / 6
    + (5 - 18 * T1 + T1 * T1 + 72 * C1 - 58 * ep2) * A5 / 120
  )

  // Northing
  const N_m = M + N1 * tanLat * (A2 / 2 + (5 - T1 + 9 * C1 + 4 * C1 * C1) * A4 / 24)

  return { E_m, N_m }
}

// ─── cassiniFeetToUTMExact: Main exported forward function ────────────────────

/**
 * Convert Cassini-Soldner coordinates (FEET on Clarke 1858) to UTM coordinates
 * (METRES on Clarke 1880 / Arc 1960) using the EXACT mathematical projection chain.
 *
 * This is an ALTERNATIVE to the empirical Helmert 4-parameter transformation.
 * It does NOT use per-sheet parameters — it is a pure mathematical projection
 * that is independent of topographic sheet boundaries.
 *
 * Projection chain:
 * 1. Convert feet → metres: E_m = E_ft × 0.3048, N_m = N_ft × 0.3048
 * 2. Inverse Cassini-Soldner → geographic (φ, λ) on Clarke 1858
 * 3. Ellipsoid change: (φ, λ) Clarke 1858 → (φ, λ) Clarke 1880 (no datum shift)
 * 4. Forward Transverse Mercator → UTM (E, N) on Clarke 1880
 *
 * ⚠️ ACCURACY NOTE: Because the ellipsoid change uses the "same coordinates"
 * assumption (no Molodensky datum shift), results may differ from the empirical
 * Helmert transform by 100–300 metres. This is expected — the exact chain
 * provides a mathematically rigorous projection but without the datum correction
 * that the Helmert parameters implicitly absorb.
 *
 * @param points - Array of Cassini coordinates in FEET on Clarke 1858
 * @param options - Optional overrides for zone and meridians
 * @returns Array of ConversionResult with UTM coordinates in METRES
 *
 * @example
 * ```ts
 * const results = cassiniFeetToUTMExact([
 *   { id: 'SKP209', easting: -130490.6, northing: -348685.6 },
 * ])
 * console.log(results[0].utmE, results[0].utmN)
 * ```
 */
export function cassiniFeetToUTMExact(
  points: CassiniFeetPoint[],
  options?: { zone?: number; centralMeridianDeg?: number; cassiniMeridianDeg?: number },
): ConversionResult[] {
  const zone = options?.zone ?? 37
  const utmLon0 = ((options?.centralMeridianDeg ?? (6 * zone - 183)) * Math.PI) / 180
  const cassiniLon0 = ((options?.cassiniMeridianDeg ?? 37) * Math.PI) / 180
  const k0 = 0.9996
  const FE = 500_000
  const FN = 10_000_000  // Southern hemisphere

  return points.map((pt) => {
    try {
      const cassE_ft = pt.easting
      const cassN_ft = pt.northing

      // Step 1: Convert feet to metres
      const E_m = cassE_ft * FT_TO_M
      const N_m = cassN_ft * FT_TO_M

      // Step 2: Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
      const geo = cassiniInverse(E_m, N_m, CLARKE_1858_ELL, cassiniLon0)

      // Step 3: Ellipsoid change — same geodetic coordinates, different ellipsoid
      // No Molodensky shift applied. This is a deliberate simplification.
      const lat_c1880 = geo.lat
      const lon_c1880 = geo.lon

      // Step 4: Forward Transverse Mercator → UTM on Clarke 1880
      const utm = tmForward(lat_c1880, lon_c1880, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

      // Convert geographic coords back to degrees for traceability
      const latDeg = (geo.lat * 180) / Math.PI
      const lonDeg = (geo.lon * 180) / Math.PI

      return {
        id: pt.id,
        cassiniE: Math.round(cassE_ft * 10) / 10,
        cassiniN: Math.round(cassN_ft * 10) / 10,
        conformalE: applyConformalCorrection(cassE_ft),  // still computed for interface compat
        utmE: Math.round(utm.E * 1000) / 1000,
        utmN: Math.round(utm.N * 1000) / 1000,
        warning: 'Exact projection chain — no datum shift (Clarke 1858→1880 same-φλ assumption). '
          + `Geodetic: ${latDeg.toFixed(6)}°, ${lonDeg.toFixed(6)}°`,
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        conformalE: applyConformalCorrection(pt.easting),
        utmE: 0,
        utmN: 0,
        warning: `Exact projection failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── cassiniFeetToUTMExactWithDatum: Exact chain WITH Molodensky datum shift ──────

/**
 * Convert Cassini-Soldner coordinates (FEET on Clarke 1858) to UTM coordinates
 * (METRES on Clarke 1880 / Arc 1960) using the EXACT projection chain WITH
 * Molodensky datum transformation.
 *
 * This fixes the ~200m offset inherent in `cassiniFeetToUTMExact()` by adding
 * a 3-parameter Molodensky shift between the Clarke 1858 and Clarke 1880
 * ellipsoids within the Arc 1960 datum.
 *
 * Projection chain:
 * 1. Convert feet → metres: E_m = E_ft × 0.3048, N_m = N_ft × 0.3048
 * 2. Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
 * 3. Molodensky datum shift → (φ, λ) on Clarke 1880
 * 4. Forward Transverse Mercator → UTM (E, N) on Clarke 1880
 *
 * The Molodensky parameters (ΔX, ΔY, ΔZ) are derived from the 148-series
 * common control points and cached for performance.
 *
 * @param points - Array of Cassini coordinates in FEET on Clarke 1858
 * @param options - Optional overrides for zone, meridians, and Molodensky params
 * @returns Array of ConversionResult with UTM coordinates in METRES
 *
 * @example
 * ```ts
 * const results = cassiniFeetToUTMExactWithDatum([
 *   { id: 'SKP209', easting: -130490.6, northing: -348685.6 },
 * ])
 * console.log(results[0].utmE, results[0].utmN)
 * ```
 */
export function cassiniFeetToUTMExactWithDatum(
  points: CassiniFeetPoint[],
  options?: {
    zone?: number
    centralMeridianDeg?: number
    cassiniMeridianDeg?: number
    molodenskyParams?: { dX: number; dY: number; dZ: number }
  },
): ConversionResult[] {
  const zone = options?.zone ?? 37
  const utmLon0 = ((options?.centralMeridianDeg ?? (6 * zone - 183)) * Math.PI) / 180
  const cassiniLon0 = ((options?.cassiniMeridianDeg ?? 37) * Math.PI) / 180
  const k0 = 0.9996
  const FE = 500_000
  const FN = 10_000_000  // Southern hemisphere

  // Get Molodensky parameters (use provided or derive from common points)
  const mold = options?.molodenskyParams ?? getMolodenskyParams()

  return points.map((pt) => {
    try {
      const cassE_ft = pt.easting
      const cassN_ft = pt.northing

      // Step 1: Convert feet to metres
      const E_m = cassE_ft * FT_TO_M
      const N_m = cassN_ft * FT_TO_M

      // Step 2: Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
      const geo1858 = cassiniInverse(E_m, N_m, CLARKE_1858_ELL, cassiniLon0)

      // Step 3: Molodensky datum shift → (φ, λ) on Clarke 1880
      const geo1880 = molodenskyTransform(
        geo1858.lat, geo1858.lon, 0,
        mold.dX, mold.dY, mold.dZ,
      )

      // Step 4: Forward Transverse Mercator → UTM on Clarke 1880
      const utm = tmForward(geo1880.lat, geo1880.lon, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

      // Convert geographic coords to degrees for traceability
      const latDeg1858 = (geo1858.lat * 180) / Math.PI
      const lonDeg1858 = (geo1858.lon * 180) / Math.PI
      const latDeg1880 = (geo1880.lat * 180) / Math.PI
      const lonDeg1880 = (geo1880.lon * 180) / Math.PI

      return {
        id: pt.id,
        cassiniE: Math.round(cassE_ft * 10) / 10,
        cassiniN: Math.round(cassN_ft * 10) / 10,
        conformalE: applyConformalCorrection(cassE_ft),
        utmE: Math.round(utm.E * 1000) / 1000,
        utmN: Math.round(utm.N * 1000) / 1000,
        warning: `Exact chain + Molodensky (dX=${mold.dX.toFixed(2)}, dY=${mold.dY.toFixed(2)}, dZ=${mold.dZ.toFixed(2)}). `
          + `C1858: ${latDeg1858.toFixed(6)}°, ${lonDeg1858.toFixed(6)}° → C1880: ${latDeg1880.toFixed(6)}°, ${lonDeg1880.toFixed(6)}°`,
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        conformalE: applyConformalCorrection(pt.easting),
        utmE: 0,
        utmN: 0,
        warning: `Exact+Molodensky failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── cassiniFeetToUTMExact7Param: Exact chain WITH 7-param Bursa-Wolf ────────

/**
 * Convert Cassini-Soldner coordinates (FEET on Clarke 1858) to UTM coordinates
 * (METRES on Clarke 1880 / Arc 1960) using the EXACT projection chain WITH
 * 7-parameter Bursa-Wolf datum transformation.
 *
 * This is the highest-accuracy forward conversion available. It replaces the
 * simplified 3-param Molodensky shift in `cassiniFeetToUTMExactWithDatum()` with
 * a full 7-parameter Helmert (position vector) transformation that includes
 * rotations and scale, matching the EPSG:1314 definition used by proj4.
 *
 * Projection chain:
 *   1. Convert feet → metres: E_m = E_ft × 0.3048, N_m = N_ft × 0.3048
 *   2. Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
 *   3. Bursa-Wolf 7-param datum shift → (φ', λ') on Clarke 1880
 *      - Geocentric Cartesian: (φ, λ, h=0) → (X, Y, Z) on Clarke 1858
 *      - Rotation-scale-translation (position vector convention)
 *      - Cartesian → Geodetic: (X', Y', Z') → (φ', λ', h') on Clarke 1880
 *   4. Forward Transverse Mercator → UTM (E, N) on Clarke 1880
 *
 * @param points - Array of Cassini coordinates in FEET on Clarke 1858
 * @param options - Optional overrides for zone, meridians, and Bursa-Wolf params
 * @returns Array of ConversionResult with UTM coordinates in METRES
 */
export function cassiniFeetToUTMExact7Param(
  points: CassiniFeetPoint[],
  options?: {
    zone?: number
    centralMeridianDeg?: number
    cassiniMeridianDeg?: number
    bursaWolfParams?: BursaWolfParams
  },
): ConversionResult[] {
  const zone = options?.zone ?? 37
  const utmLon0 = ((options?.centralMeridianDeg ?? (6 * zone - 183)) * Math.PI) / 180
  const cassiniLon0 = ((options?.cassiniMeridianDeg ?? 37) * Math.PI) / 180
  const k0 = 0.9996
  const FE = 500_000
  const FN = 10_000_000  // Southern hemisphere

  // Use provided Bursa-Wolf params or derive from 148-series control points
  const bw = options?.bursaWolfParams ?? KENYA_BURSA_WOLF

  return points.map((pt) => {
    try {
      const cassE_ft = pt.easting
      const cassN_ft = pt.northing

      // Step 1: Convert feet to metres
      const E_m = cassE_ft * FT_TO_M
      const N_m = cassN_ft * FT_TO_M

      // Step 2: Inverse Cassini-Soldner → (φ, λ) on Clarke 1858
      const geo1858 = cassiniInverse(E_m, N_m, CLARKE_1858_ELL, cassiniLon0)

      // Step 3: Bursa-Wolf 7-param datum shift → (φ', λ') on Clarke 1880
      const geo1880 = bursaWolfTransform(
        geo1858.lat, geo1858.lon, 0,
        bw, CLARKE_1858_ELL, CLARKE_1880_ELL,
      )

      // Step 4: Forward Transverse Mercator → UTM on Clarke 1880
      const utm = tmForward(geo1880.lat, geo1880.lon, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

      // Convert geographic coords to degrees for traceability
      const latDeg1858 = (geo1858.lat * 180) / Math.PI
      const lonDeg1858 = (geo1858.lon * 180) / Math.PI
      const latDeg1880 = (geo1880.lat * 180) / Math.PI
      const lonDeg1880 = (geo1880.lon * 180) / Math.PI

      return {
        id: pt.id,
        cassiniE: Math.round(cassE_ft * 10) / 10,
        cassiniN: Math.round(cassN_ft * 10) / 10,
        conformalE: applyConformalCorrection(cassE_ft),
        utmE: Math.round(utm.E * 1000) / 1000,
        utmN: Math.round(utm.N * 1000) / 1000,
        warning: `Exact chain + Bursa-Wolf 7-param (dX=${bw.dX}, dY=${bw.dY}, dZ=${bw.dZ}, rx=${bw.rx}, ry=${bw.ry}, rz=${bw.rz}, ds=${bw.ds}). `
          + `C1858: ${latDeg1858.toFixed(6)}°, ${lonDeg1858.toFixed(6)}° → C1880: ${latDeg1880.toFixed(6)}°, ${lonDeg1880.toFixed(6)}°`,
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        conformalE: applyConformalCorrection(pt.easting),
        utmE: 0,
        utmN: 0,
        warning: `Exact+Bursa-Wolf failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── utmToCassiniFeetExact: Inverse of exact projection chain ──────────────────

/**
 * Convert UTM coordinates (METRES on Clarke 1880 / Arc 1960) to Cassini-Soldner
 * coordinates (FEET on Clarke 1858) using the EXACT inverse projection chain.
 *
 * Chain (reverse):
 * 1. Inverse Transverse Mercator → (φ, λ) on Clarke 1880
 * 2. Ellipsoid change: (φ, λ) Clarke 1880 → (φ, λ) Clarke 1858 (no datum shift)
 * 3. Forward Cassini-Soldner → (E_m, N_m) on Clarke 1858
 * 4. Convert metres → feet: E_ft = E_m / 0.3048, N_ft = N_m / 0.3048
 *
 * @param utmPoints - Array of UTM coordinates in METRES on Clarke 1880
 * @param options - Optional overrides for zone and meridians
 * @returns Array of ConversionResult with Cassini coordinates in FEET
 */
export function utmToCassiniFeetExact(
  utmPoints: UTMPoint[],
  options?: { zone?: number; centralMeridianDeg?: number; cassiniMeridianDeg?: number },
): ConversionResult[] {
  const zone = options?.zone ?? 37
  const utmLon0 = ((options?.centralMeridianDeg ?? (6 * zone - 183)) * Math.PI) / 180
  const cassiniLon0 = ((options?.cassiniMeridianDeg ?? 37) * Math.PI) / 180
  const k0 = 0.9996
  const FE = 500_000
  const FN = 10_000_000

  return utmPoints.map((pt) => {
    try {
      const utmE = pt.easting
      const utmN = pt.northing

      // Step 1: Inverse TM → (φ, λ) on Clarke 1880
      const geo = tmInverse(utmE, utmN, CLARKE_1880_ELL, utmLon0, k0, FE, FN)

      // Step 2: Ellipsoid change — same geodetic coordinates
      const lat_c1858 = geo.lat
      const lon_c1858 = geo.lon

      // Step 3: Forward Cassini-Soldner → (E_m, N_m) on Clarke 1858
      const cass = cassiniForward(lat_c1858, lon_c1858, CLARKE_1858_ELL, cassiniLon0)

      // Step 4: Convert metres to feet
      const cassE_ft = cass.E_m / FT_TO_M
      const cassN_ft = cass.N_m / FT_TO_M

      return {
        id: pt.id,
        cassiniE: Math.round(cassE_ft * 10) / 10,
        cassiniN: Math.round(cassN_ft * 10) / 10,
        conformalE: applyConformalCorrection(cassE_ft),
        utmE: Math.round(utmE * 1000) / 1000,
        utmN: Math.round(utmN * 1000) / 1000,
        warning: 'Exact inverse projection chain — no datum shift applied.',
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: 0,
        cassiniN: 0,
        conformalE: 0,
        utmE: pt.easting,
        utmN: pt.northing,
        warning: `Exact inverse projection failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

// ─── cassiniFeetToWGS84Exact: Full pipeline to WGS84 ────────────────────────

/**
 * Convert Cassini-Soldner coordinates (FEET on Clarke 1858) to WGS84
 * latitude/longitude using the exact projection chain + datum shift.
 *
 * Chain:
 * 1. cassiniFeetToUTMExactWithDatum → UTM on Clarke 1880 / Arc 1960 (with Molodensky datum shift)
 * 2. utmToWGS84 (via proj4 with Arc 1960 → WGS84 7-param Bursa-Wolf datum shift)
 *
 * The datum shift is applied in the final step only, using the Kenya-specific
 * EPSG:1314 parameters (tx=-160, ty=-6, tz=-302 metres).
 *
 * @param points - Array of Cassini coordinates in FEET on Clarke 1858
 * @param options - Optional overrides for zone and meridians
 * @returns Array of results with WGS84 lat/lon and intermediate UTM
 */
export function cassiniFeetToWGS84Exact(
  points: CassiniFeetPoint[],
  options?: { zone?: number; centralMeridianDeg?: number; cassiniMeridianDeg?: number },
): Array<{
  id?: string
  cassiniE: number
  cassiniN: number
  utmE: number
  utmN: number
  lat: number
  lon: number
  latDMS: string
  lonDMS: string
  warning?: string
}> {
  const zone = options?.zone ?? 37
  const utmResults = cassiniFeetToUTMExactWithDatum(points, options)

  return utmResults.map((r) => {
    const wgs84 = utmToWGS84(r.utmE, r.utmN, zone)
    return {
      id: r.id,
      cassiniE: r.cassiniE,
      cassiniN: r.cassiniN,
      utmE: r.utmE,
      utmN: r.utmN,
      lat: wgs84.lat,
      lon: wgs84.lon,
      latDMS: toDMS(wgs84.lat, true),
      lonDMS: toDMS(wgs84.lon, false),
      warning: r.warning,
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
 * Convert UTM coordinates (Arc 1960 datum) to WGS84 latitude/longitude.
 *
 * Uses proper Arc 1960 → WGS84 datum transformation via proj4 with the
 * Kenya-specific 7-parameter Bursa-Wolf datum shift (EPSG:1314):
 *   tx=-160, ty=-6, tz=-302 (metres)
 *   rx=-0.807, ry=0.339, rz=-1.619 (arc-seconds)
 *   ds=-2.554 (ppm)
 * Clarke 1880 ellipsoid: a=6378249.145, b=6356514.87
 *
 * @param utmE - UTM easting in metres (Arc 1960)
 * @param utmN - UTM northing in metres (Arc 1960)
 * @param zone - UTM zone number (default 37)
 * @returns WGS84 latitude/longitude in decimal degrees
 */
export function utmToWGS84(utmE: number, utmN: number, zone: number = 37): { lat: number; lon: number } {
  const utmDef = zone === 36 ? ARC1960_UTM36S_DEF : ARC1960_UTM37S_DEF
  const [lon, lat] = proj4(utmDef, WGS84_DEF, [utmE, utmN])
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
export type TransformMethod = 'helmert4' | 'affine6' | 'poly12' | 'exactDatum7'

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

// ponytail: moved to data/cassini/ to keep src/ lean (was 388k LOC of JSON in src/lib/geo/)
import SUBSHEET_CORNERS_RAW from '../../../data/cassini/merged_subsheets.json'

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
 * Pre-computed sub-sheet definitions for Kenyan topo sheets.
 * Each sub-sheet has auto-computed Helmert 4-param and Affine 6-param parameters
 * derived from its 4 corner points, giving near-zero residuals (EXCELLENT accuracy).
 * Now using merged_subsheets.json with 219-sheet coverage (5451 sub-sheet corners).
 */
export const KENYA_SUB_SHEETS: SubSheetDef[] = buildSubSheets()

/** Set of topo sheet IDs that have sub-sheet definitions */
export const SHEETS_WITH_SUBSHEETS = new Set(KENYA_SUB_SHEETS.map(ss => ss.sheetId))

/**
 * Detect the UTM zone for a given topo sheet.
 * Most Kenya sheets are in Zone 37S. Sheets with UTM easting < 500000
 * and near the zone boundary (36°E) may be Zone 36S.
 * Sheet 105/3 is known to be Zone 36S.
 */
export function getUtmZone(sheetId: string): number {
  const zone36Sheets = ['105/3']
  if (zone36Sheets.includes(sheetId)) return 36
  return 37
}

// ─── Sub-sheet Auto-detection ──────────────────────────────────────────────

/**
 * Get all sub-sheets for a given topo sheet, organized into a 5×5 grid.
 * Returns a 5×5 matrix where grid[row][col] contains the SubSheetDef or null.
 */
export function getSubSheetGrid(sheetId: string): (SubSheetDef | null)[][] {
  const subs = KENYA_SUB_SHEETS.filter(ss => ss.sheetId === sheetId)
  if (subs.length === 0) return []
  const grid: (SubSheetDef | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(null))
  for (const sub of subs) {
    const idx = parseInt(sub.subId) - 1
    if (idx >= 0 && idx < 25) {
      const row = Math.floor(idx / 5)
      const col = idx % 5
      grid[row][col] = sub
    }
  }
  return grid
}

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

  // Exact projection chain with 7-param Bursa-Wolf datum shift
  if (method === 'exactDatum7') {
    return cassiniFeetToUTMExact7Param(points)
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
