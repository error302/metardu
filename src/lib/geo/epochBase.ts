/**
 * Base types, earth constants, and coordinate conversion helpers
 * shared between epochManager.ts and epochManagerRigorous.ts.
 */

export type ReferenceFrame = 'ITRF2014' | 'ITRF2008' | 'ITRF2020' | 'WGS84_G1762' | 'WGS84_G1674' | 'WGS84_G1150' | 'UNKNOWN'

export interface EpochCoordinate {
  /** Latitude (WGS84 degrees) */
  latitude: number
  /** Longitude (WGS84 degrees) */
  longitude: number
  /** Ellipsoidal height (meters) */
  height: number
  /** Reference frame */
  frame: ReferenceFrame
  /** Decimal year epoch (e.g., 2025.5 = July 2025) */
  epoch: number
}

export interface PropagatedCoordinate extends EpochCoordinate {
  /** The epoch this coordinate was propagated FROM */
  sourceEpoch: number
  /** The frame this coordinate was propagated FROM */
  sourceFrame: ReferenceFrame
  /** The velocity (m/year) applied during propagation */
  velocity: { ve: number; vn: number; vu: number }
  /** The time span in years */
  dtYears: number
  /** The displacement applied (meters) */
  displacement: { de: number; dn: number; du: number }
  /** Provenance */
  provenance: string
}

// ─── Plate Velocity Model ───────────────────────────────────────────────────

/**
 * ITRF2014 angular velocity vector for the Somali plate (Somalia).
 *
 * Source: Altamimi et al. (2017), Table 2 — ITRF2014 plate motion model.
 * Values are in rad/year.
 *
 * The Somali plate covers Kenya, Somalia, eastern Ethiopia, and the
 * East African Rift.
 *
 * ωx = -0.321 × 10⁻⁹ rad/yr
 * ωy = -1.187 × 10⁻⁹ rad/yr
 * ωz =  1.384 × 10⁻⁹ rad/yr
 */
export const SOMALI_PLATE_OMEGA = {
  wx: -0.321e-9, // rad/year
  wy: -1.187e-9, // rad/year
  wz: 1.384e-9,  // rad/year
} as const

/**
 * Other plates for reference (not used in Kenya but available for future use).
 */
export const PLATE_VELOCITIES: Record<string, { wx: number; wy: number; wz: number }> = {
  SOMALI: SOMALI_PLATE_OMEGA,
  NUBIA: { wx: 0.248e-9, wy: -0.921e-9, wz: 0.816e-9 }, // ITRF2014 Nubia
  VICTORIA: { wx: 0.234e-9, wy: -0.825e-9, wz: 0.952e-9 }, // ITRF2014 Victoria
  ARABIA: { wx: 0.985e-9, wy: -0.295e-9, wz: 0.892e-9 },
}

// ─── Earth Constants ────────────────────────────────────────────────────────

export const WGS84_A = 6378137.0 // semi-major axis (meters)
export const WGS84_F = 1 / 298.257223563 // flattening
export const WGS84_B = WGS84_A * (1 - WGS84_F) // semi-minor axis

// ─── Coordinate Conversions ─────────────────────────────────────────────────

/**
 * Convert geodetic coordinates (lat, lon, height) to ECEF (X, Y, Z).
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param h - Ellipsoidal height in meters
 * @returns [X, Y, Z] in ECEF (meters)
 */
export function geodeticToEcef(lat: number, lon: number, h: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180
  const lambda = (lon * Math.PI) / 180
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const sinLambda = Math.sin(lambda)
  const cosLambda = Math.cos(lambda)

  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F // first eccentricity squared
  const N = WGS84_A / Math.sqrt(1 - e2 * sinPhi * sinPhi) // radius of curvature

  const X = (N + h) * cosPhi * cosLambda
  const Y = (N + h) * cosPhi * sinLambda
  const Z = (N * (1 - e2) + h) * sinPhi

  return [X, Y, Z]
}

/**
 * Convert ECEF (X, Y, Z) to geodetic (lat, lon, height).
 * Uses Bowring's method for accuracy.
 */
export function ecefToGeodetic(X: number, Y: number, Z: number): { latitude: number; longitude: number; height: number } {
  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F
  const ep2 = e2 / (1 - e2) // second eccentricity squared

  const p = Math.sqrt(X * X + Y * Y)
  const theta = Math.atan2(Z * WGS84_A, p * WGS84_B)

  const sinTheta = Math.sin(theta)
  const cosTheta = Math.cos(theta)

  const lat = Math.atan2(
    Z + ep2 * WGS84_B * sinTheta * sinTheta * sinTheta,
    p - e2 * WGS84_A * cosTheta * cosTheta * cosTheta,
  )
  const lon = Math.atan2(Y, X)

  const sinLat = Math.sin(lat)
  const N = WGS84_A / Math.sqrt(1 - e2 * sinLat * sinLat)
  const h = p / Math.cos(lat) - N

  return {
    latitude: (lat * 180) / Math.PI,
    longitude: (lon * 180) / Math.PI,
    height: h,
  }
}
