/**
 * Canonical survey point types for Metardu.
 *
 * ─── Why this file exists ───────────────────────────────────────────────
 * Before this consolidation, the codebase had ~12 divergent `SurveyPoint`
 * interfaces scattered across export/, map/, topo/, parcel/, orchestrator/,
 * and generators/. They were structurally compatible (so TypeScript didn't
 * complain) but semantically different — some had `id`, some had `name`,
 * some had `code`, some had `lat/lon`. This made it impossible to pass a
 * point from one module to another without silent field loss.
 *
 * Every module MUST now import from this file. Local declarations of
 * `SurveyPoint` are banned by the eslint rule `no-restricted-syntax` in
 * `.eslintrc.json`.
 *
 * ─── Design principles ─────────────────────────────────────────────────
 * 1. The canonical `SurveyPoint` matches the database row shape — fields
 *    that exist in the `survey_points` table are required or optional
 *    exactly as the schema dictates.
 * 2. Pure-geometry call sites (IDW, turf, area) use `Point2D` or `Point3D`
 *    instead. They have no identity and no database coupling.
 * 3. Specialised variants (`SurveyPointWithCode`, `SurveyPoint3D`) are
 *    standalone (not extending SurveyPoint) because their domains
 *    frequently lack a human-assigned `name`.
 *
 * ─── CRS convention ────────────────────────────────────────────────────
 * `easting`/`northing` are in metres, in the project CRS (typically
 * Arc 1960 / UTM Zone 37 South, EPSG:21037). `lat`/`lon`, when present,
 * are decimal degrees in WGS84 (EPSG:4326). `elevation` is orthometric
 * height in metres above MSL unless explicitly noted otherwise.
 */

// ─── Pure geometry (no identity, no DB coupling) ────────────────────────

/** A 2D coordinate pair in metres (project CRS). */
export interface Point2D {
  easting: number
  northing: number
}

/** A 3D coordinate triple in metres (project CRS). */
export interface Point3D extends Point2D {
  elevation: number
}

// ─── Canonical survey point (database row shape) ───────────────────────

/**
 * A survey point as stored in the `survey_points` table.
 *
 * Field optionality mirrors the DB schema:
 * - `id` is optional because the type is also used for points being
 *   created client-side before insertion.
 * - `elevation` is nullable because some points (e.g. horizontal control)
 *   have no measured height.
 * - `is_control` defaults to `false`; `control_order` only applies when
 *   `is_control` is true.
 * - `code` and `description` are nullable topo feature attributes.
 *
 * AUDIT FIX (C5, 2026-07-02): Added CRS, accuracy, and provenance fields
 * to match migration 027. All new fields are optional for backward
 * compatibility, but new code SHOULD populate them — especially `datum`,
 * `utm_zone`, and `source` — so the chain-of-custody is preserved.
 */
export interface SurveyPoint {
  /** UUID; optional for points not yet persisted */
  id?: string
  /** Human-readable identifier (e.g. "TS1", "BM-12", "P-003") */
  name: string
  /** Easting in metres (project CRS) */
  easting: number
  /** Northing in metres (project CRS) */
  northing: number
  /** Orthometric height in metres above MSL; null if not measured */
  elevation?: number | null
  /** True if this is a control point (traverse station, BM, GCP) */
  is_control?: boolean
  /** Control order, e.g. "1st", "2nd", "3rd" — only when is_control */
  control_order?: string
  /** Topo feature code (e.g. "BUILD", "TREE", "ROAD_EDGE") */
  code?: string | null
  /** Free-text description */
  description?: string | null
  /** WGS84 latitude in decimal degrees (computed, not stored) */
  lat?: number
  /** WGS84 longitude in decimal degrees (computed, not stored) */
  lon?: number
  /** Whether the point is locked from editing (e.g. imported control) */
  locked?: boolean

  // ─── CRS metadata (migration 027) ──────────────────────────────────────
  /** Coordinate datum (Arc 1960, WGS84). Defaults to project datum. */
  datum?: string | null
  /** Map projection (UTM, Cassini-Soldner). Default UTM. */
  projection?: string | null
  /** UTM zone (1-60). Defaults to project utm_zone. */
  utm_zone?: number | null
  /** Hemisphere: 'N' or 'S'. Defaults to project hemisphere. */
  hemisphere?: 'N' | 'S' | null
  /** Coordinate epoch year (for time-dependent reference frames). */
  epoch_year?: number | null

  // ─── Accuracy metadata (migration 027) ─────────────────────────────────
  /** Standard deviation of easting (metres). Null = unknown. */
  std_dev_e?: number | null
  /** Standard deviation of northing (metres). Null = unknown. */
  std_dev_n?: number | null
  /** Standard deviation of elevation (metres). Null = unknown. */
  std_dev_z?: number | null
  /** Semi-major axis of error ellipse at confidence_level (metres). */
  error_ellipse_major?: number | null
  /** Semi-minor axis of error ellipse at confidence_level (metres). */
  error_ellipse_minor?: number | null
  /** Orientation of error ellipse major axis (degrees from North). */
  error_ellipse_orient?: number | null
  /** Confidence level for the error ellipse (95 = 95%). Default 95. */
  confidence_level?: number | null

  // ─── Provenance metadata (migration 027) ───────────────────────────────
  /** Origin of the coordinate: manual, gnss, total_station, imported, adjusted. */
  source?: 'manual' | 'gnss' | 'total_station' | 'imported' | 'adjusted' | 'unknown' | null
  /** FK to equipment table. Null if instrument not recorded. */
  instrument_id?: string | null
  /** FK to users table — who observed this point. Null if unknown. */
  observer_id?: string | null
  /** UUID of the import session that loaded this point (if source = imported). */
  import_session_id?: string | null
  /** Date the point was observed in the field. */
  observation_date?: string | null
}

// ─── Specialised variants ──────────────────────────────────────────────

/**
 * A survey point that carries a feature code, used by topo classification.
 *
 * Does NOT extend `SurveyPoint` because topo point clouds often lack a
 * human-assigned `name` (e.g. raw tacheometry readings). `code` is required
 * because the classifier contract depends on it.
 */
export interface SurveyPointWithCode {
  /** Easting in metres (project CRS) */
  easting: number
  /** Northing in metres (project CRS) */
  northing: number
  /** Orthometric height in metres above MSL; optional for 2D coded points */
  elevation?: number
  /** Topo feature code (e.g. "BUILD", "TREE", "ROAD_EDGE") — required */
  code: string
  /** Sequential point number from the field book (e.g. "1", "2", "3") */
  pointNumber?: string
  /** Optional human-readable identifier if known */
  name?: string
  /** Optional UUID if the point has been persisted */
  id?: string
}

/**
 * A 3D survey point with guaranteed elevation, used by mining/volumetric
 * modules where height is mandatory. Does NOT extend `SurveyPoint` because
 * mining scans frequently lack a `name` field.
 */
export interface SurveyPoint3D {
  id?: string
  easting: number
  northing: number
  elevation: number
  code?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Type guard: does this object look like a SurveyPoint? */
export function isSurveyPoint(value: unknown): value is SurveyPoint {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.id === undefined || typeof v.id === 'string') &&
    typeof v.name === 'string' &&
    typeof v.easting === 'number' &&
    typeof v.northing === 'number' &&
    (v.elevation === undefined ||
      v.elevation === null ||
      typeof v.elevation === 'number')
  )
}

/** Coerce a partial/loose record into a SurveyPoint, throwing on invalid shape. */
export function asSurveyPoint(value: Record<string, unknown>): SurveyPoint {
  if (!isSurveyPoint(value)) {
    throw new Error(
      `Invalid SurveyPoint: missing required fields (name/easting/northing). Got: ${JSON.stringify(value).slice(0, 200)}`
    )
  }
  return value
}
