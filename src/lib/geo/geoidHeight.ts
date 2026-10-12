/**
 * Regional geoid screening calculator.
 *
 * Calculates an indicative orthometric-height estimate from a coarse,
 * rounded legacy regional grid. Its data provenance has not been verified;
 * this is not a survey-grade geoid model and has no validated local
 * vertical-datum tie.
 *
 * Formula: H = h - N
 *   H = Orthometric height (above mean sea level / geoid)
 *   h = Ellipsoidal height (from GNSS, above WGS84 ellipsoid)
 *   N = Geoid undulation (gap between geoid and ellipsoid)
 *
 * Do not use the output for construction design, setting out, certification,
 * or acceptance. Those tasks require a verified geoid/local vertical datum
 * model and project control checks.
 */

// ─── Legacy regional 5°×5° grid for East Africa ────────────────────────────
// Values are indicative geoid undulation N in metres at 5° intervals.
// Grid covers latitude -15° to +15°, longitude 25° to 55° (East Africa region).
// Negative values mean the supplied grid's geoid height is below the ellipsoid.
// Provenance and accuracy are unknown; never advertise these values as an
// official NGA EGM96 grid or a local vertical datum.

// Grid dimensions
const GRID_LAT_MIN = -15
const GRID_LAT_MAX = 15
const GRID_LON_MIN = 25
const GRID_LON_MAX = 55
const GRID_STEP = 5

// Legacy N values (metres) at each grid node
// Row order: north to south (lat 15 to -15)
// Column order: west to east (lon 25 to 55)
const REGIONAL_GRID: number[][] = [
  // lat 15° (north row)
  [  -2,  -3,  -5,  -7,  -8,  -9,  -9],
  // lat 10°
  [  -4,  -6,  -8, -10, -11, -11, -10],
  // lat 5°
  [  -7,  -9, -11, -13, -14, -13, -12],
  // lat 0° (equator)
  [ -10, -12, -14, -16, -16, -15, -13],
  // lat -5°
  [ -12, -14, -16, -17, -17, -16, -14],
  // lat -10°
  [ -13, -15, -17, -17, -17, -16, -14],
  // lat -15° (south row)
  [ -14, -15, -16, -16, -15, -14, -12],
]

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HeightConversionInput {
  /** Latitude in decimal degrees */
  latitude: number
  /** Longitude in decimal degrees */
  longitude: number
  /** Ellipsoidal height in metres (from GNSS) */
  ellipsoidalHeight: number
}

export interface GeoidGridNode {
  lat1: number; lat2: number
  lon1: number; lon2: number
  n11: number; n12: number; n21: number; n22: number
}

interface HeightConversionResultBase {
  ellipsoidalHeight: number
  model: string
  /** Accuracy is intentionally unknown for this unvalidated screening grid. */
  accuracy: null
  reason: string
}

export interface IndicativeHeightConversionResult extends HeightConversionResultBase {
  status: 'indicative'
  geoidUndulation: number
  orthometricHeight: number
  heightDifference: number
  gridNode: GeoidGridNode
}

export interface UnavailableHeightConversionResult extends HeightConversionResultBase {
  status: 'unavailable'
  geoidUndulation: null
  orthometricHeight: null
  heightDifference: null
  gridNode: null
}

export type HeightConversionResult = IndicativeHeightConversionResult | UnavailableHeightConversionResult

export interface BatchHeightResult {
  id: string
  input: HeightConversionInput
  result: HeightConversionResult
}

// ─── Grid interpolation ─────────────────────────────────────────────────────

/**
 * Interpolate geoid undulation N at a given latitude/longitude using
 * bilinear interpolation on the coarse regional 5° grid.
 *
 * Bilinear interpolation:
 *   N = N11(1-dx)(1-dy) + N21(dx)(1-dy) + N12(1-dx)(dy) + N22(dx)(dy)
 *
 * Where:
 *   dx = (lon - lon1) / (lon2 - lon1)
 *   dy = (lat - lat1) / (lat2 - lat1)
 *   N11 = grid value at (lat1, lon1) — southwest corner
 *   N21 = grid value at (lat1, lon2) — southeast corner
 *   N12 = grid value at (lat2, lon1) — northwest corner
 *   N22 = grid value at (lat2, lon2) — northeast corner
 */
export function interpolateGeoidUndulation(
  latitude: number,
  longitude: number,
): { undulation: number; gridNode: GeoidGridNode } | null {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < GRID_LAT_MIN || latitude > GRID_LAT_MAX ||
    longitude < GRID_LON_MIN || longitude > GRID_LON_MAX
  ) return null

  const lat = latitude
  const lon = longitude

  // Find grid cell
  const latIdx = Math.floor((GRID_LAT_MAX - lat) / GRID_STEP)
  const lonIdx = Math.floor((lon - GRID_LON_MIN) / GRID_STEP)

  const row = Math.max(0, Math.min(REGIONAL_GRID.length - 2, latIdx))
  const col = Math.max(0, Math.min(REGIONAL_GRID[0].length - 2, lonIdx))

  // Grid node coordinates
  // Row 0 = lat 15° (north), Row 6 = lat -15° (south)
  const lat1 = GRID_LAT_MAX - row * GRID_STEP          // north edge
  const lat2 = GRID_LAT_MAX - (row + 1) * GRID_STEP    // south edge
  const lon1 = GRID_LON_MIN + col * GRID_STEP          // west edge
  const lon2 = GRID_LON_MIN + (col + 1) * GRID_STEP    // east edge

  // Grid values (remember: row 0 = north, so row+1 = south)
  const n12 = REGIONAL_GRID[row][col]       // NW (north, west)
  const n22 = REGIONAL_GRID[row][col + 1]   // NE (north, east)
  const n11 = REGIONAL_GRID[row + 1][col]   // SW (south, west)
  const n21 = REGIONAL_GRID[row + 1][col + 1] // SE (south, east)

  // Interpolation fractions
  const dx = (lon - lon1) / (lon2 - lon1)
  const dy = (lat1 - lat) / (lat1 - lat2) // Note: dy goes north→south

  // Bilinear interpolation
  const n = n11 * (1 - dx) * (1 - dy) +
            n21 * dx * (1 - dy) +
            n12 * (1 - dx) * dy +
            n22 * dx * dy

  return {
    undulation: n,
    gridNode: { lat1, lat2, lon1, lon2, n11, n12, n21, n22 },
  }
}

// ─── Height conversion ──────────────────────────────────────────────────────

/**
 * Convert ellipsoidal height to orthometric height.
 *
 * H = h - N
 *
 * @param input Location + ellipsoidal height
 * @returns Conversion result with geoid undulation and orthometric height
 */
export function convertEllipsoidalToOrthometric(
  input: HeightConversionInput,
): HeightConversionResult {
  const model = 'Unverified regional 5° screening grid'
  const unsafeUseReason = 'Indicative screening estimate only. Accuracy and local vertical-datum compatibility are unverified; do not use for design, construction set-out, certification, or acceptance.'
  const unavailable = (reason: string): UnavailableHeightConversionResult => ({
    status: 'unavailable',
    geoidUndulation: null,
    orthometricHeight: null,
    ellipsoidalHeight: input.ellipsoidalHeight,
    heightDifference: null,
    gridNode: null,
    model,
    accuracy: null,
    reason,
  })

  if (
    !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) ||
    !Number.isFinite(input.ellipsoidalHeight)
  ) return unavailable('Latitude, longitude, and ellipsoidal height must be finite numbers.')

  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
    return unavailable('Coordinates are outside valid geographic latitude/longitude ranges.')
  }

  const interp = interpolateGeoidUndulation(input.latitude, input.longitude)

  if (!interp) {
    return unavailable(`This screening grid covers only latitude ${GRID_LAT_MIN}° to ${GRID_LAT_MAX}° and longitude ${GRID_LON_MIN}° to ${GRID_LON_MAX}°. No extrapolation is performed.`)
  }

  const N = interp.undulation
  const H = input.ellipsoidalHeight - N

  return {
    status: 'indicative',
    geoidUndulation: N,
    orthometricHeight: H,
    ellipsoidalHeight: input.ellipsoidalHeight,
    heightDifference: N,
    gridNode: interp.gridNode,
    model,
    accuracy: null,
    reason: unsafeUseReason,
  }
}

/**
 * Batch convert a list of points from ellipsoidal to orthometric heights.
 */
export function batchConvertHeights(
  points: Array<{ id: string; latitude: number; longitude: number; ellipsoidalHeight: number }>,
): BatchHeightResult[] {
  return points.map(p => ({
    id: p.id,
    input: {
      latitude: p.latitude,
      longitude: p.longitude,
      ellipsoidalHeight: p.ellipsoidalHeight,
    },
    result: convertEllipsoidalToOrthometric({
      latitude: p.latitude,
      longitude: p.longitude,
      ellipsoidalHeight: p.ellipsoidalHeight,
    }),
  }))
}
