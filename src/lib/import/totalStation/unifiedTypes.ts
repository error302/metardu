/**
 * Unified Total Station Import Types
 *
 * Common interfaces normalised from all instrument formats:
 *   Leica GSI, SDR33, South/Nikon, Topcon, JobXML
 *
 * Every adapter maps its parser-specific output into these types
 * so downstream code can consume a single consistent shape.
 */

// ─── Observation (angular / distance measurement) ───────────────────────

export interface UnifiedObservation {
  /** Station (instrument setup) point identifier */
  stationId: string
  /** Target point identifier */
  targetId: string
  /** Face of observation: Face-Left / Face-Right / Face-1 / Face-2 */
  face: 'FL' | 'FR' | 'F1' | 'F2' | 'unknown'

  // ── Angular measurements ──
  /** Horizontal (circle) angle in decimal degrees */
  horizontalAngle?: number
  /** Vertical (zenith / altitude) angle in decimal degrees */
  verticalAngle?: number

  // ── Distance measurements ──
  /** Slope (slant) distance in metres */
  slopeDistance?: number
  /** Horizontal distance in metres */
  horizontalDistance?: number
  /** Height difference (ΔH) in metres */
  heightDifference?: number

  // ── Instrument / prism metadata ──
  /** Prism / reflector constant in metres */
  prismConstant?: number
  /** Height of prism / target above point in metres */
  prismHeight?: number
  /** Height of instrument above station in metres */
  instrumentHeight?: number

  // ── Atmospheric / EDM settings ──
  /** PPM atmospheric correction */
  ppm?: number
  /** Whether atmospheric correction was applied */
  atmCorrection?: boolean
  /** EDM measurement mode string (e.g. "precise", "standard", "tracking") */
  edmMode?: string

  // ── Computed coordinate of the target ──
  easting?: number
  northing?: number
  elevation?: number

  // ── Timestamp ──
  timestamp?: Date
}

// ─── Raw coordinate point ───────────────────────────────────────────────

export interface UnifiedRawPoint {
  id: string
  easting: number
  northing: number
  elevation: number
  code: string
}

// ─── Top-level import result ────────────────────────────────────────────

export interface UnifiedImportResult {
  /** Detected source format key (e.g. "gsi", "sdr", "south", …) */
  format: string
  /** Instrument make / family (e.g. "Leica", "Sokkia/SDR", "South", …) */
  instrument: string
  /** Station name when determinable from observations */
  stationName: string
  /** Station coordinates (first record with both angles and distances) */
  stationCoords?: { easting: number; northing: number; elevation: number }

  /** All individual observations (one per shot) */
  observations: UnifiedObservation[]

  /** Face-means: FL/FR pairs averaged to single observation */
  meanedObservations: UnifiedObservation[]

  /** Coordinate-only points extracted from the file */
  rawPoints: UnifiedRawPoint[]

  /** Non-fatal issues encountered during parsing */
  errors: string[]
  warnings: string[]
}
