/**
 * Project Reference System — persistence mapping.
 *
 * Turns the settings-form declaration (datum selection + UTM zone +
 * hemisphere + vertical/calibration/grid-ground fields) into a validated
 * ProjectReferenceSystem (src/lib/spatial/projectCrs.ts), and maps the
 * stored `project_reference_systems` row (migration 065) back.
 *
 * PURE: no database imports — the API route owns the SQL, this module owns
 * the derivation and validation, so both sides of the wire are unit-tested.
 *
 * BLUEPRINT §4.2: "No exporter may hard-code a project CRS." Everything
 * downstream must take its CRS from here.
 * BLUEPRINT §2.4: no silent defaults. An unknown datum selection, an
 * unregistered zone, a geographic CRS, or a hemisphere that contradicts the
 * authority all throw CrsError instead of being coerced.
 */

import {
  CrsError,
  WGS84_CRS,
  createProjectReferenceSystem,
  transformPoint,
  type ProjectReferenceSystem,
} from './projectCrs'

// ─── Form input ─────────────────────────────────────────────────────────────

/**
 * The datum selector values used by the project settings UI, plus the
 * legacy spellings that already exist in `projects.datum` rows
 * ('Arc 1960', 'WGS 84', ...).
 */
export type DatumSelection = 'ARC1960' | 'WGS84' | 'WGS84Geographic'

/** How a horizontal EPSG code relates to the declared reference system. */
export interface EpsgDescription {
  /** The EPSG code, normalized (e.g. 'EPSG:21037'). */
  code: string;
  /** Human-readable datum name for certificates and title blocks. */
  datum: string;
  /** Projection family name, e.g. 'UTM Zone 37S'. */
  projection: string;
  /** Grid units of the projected CRS. */
  units: 'metre';
}

/**
 * Describe a horizontal EPSG code so deliverables can state the reference
 * system they were computed in instead of printing a remembered constant
 * (blueprint §2.4, §4.2: no exporter may hard-code a project CRS).
 *
 * Only the Kenyan/African codes this platform actually uses are named
 * explicitly; anything else is reported by code so an unknown CRS is never
 * mislabelled as Arc 1960.
 */
export function describeEpsg(epsgCode: string): EpsgDescription {
  const match = /^EPSG:(\d{4,5})$/i.exec(epsgCode.trim());
  if (!match) {
    throw new CrsError('CRS_INVALID', `Unrecognized EPSG code: ${epsgCode}`);
  }
  const code = Number(match[1]);
  const units = 'metre' as const;

  // Arc 1960 / UTM: 2103x south, 2109x north.
  if (code >= 21031 && code <= 21040) {
    const zone = code - 21000;
    return { code: `EPSG:${code}`, datum: 'Arc 1960', projection: `UTM Zone ${zone}S`, units };
  }
  if (code >= 21091 && code <= 21100) {
    const zone = code - 21090;
    return { code: `EPSG:${code}`, datum: 'Arc 1960', projection: `UTM Zone ${zone}N`, units };
  }
  // WGS 84 / UTM: 327xx south, 326xx north.
  if (code >= 32701 && code <= 32760) {
    const zone = code - 32700;
    return { code: `EPSG:${code}`, datum: 'WGS 84', projection: `UTM Zone ${zone}S`, units };
  }
  if (code >= 32601 && code <= 32660) {
    const zone = code - 32600;
    return { code: `EPSG:${code}`, datum: 'WGS 84', projection: `UTM Zone ${zone}N`, units };
  }
  if (code === 4326) {
    return { code: 'EPSG:4326', datum: 'WGS 84', projection: 'Geographic (lat/lon)', units };
  }
  // Known but unnamed here: state the code, never guess a datum for it.
  return { code: `EPSG:${code}`, datum: `EPSG:${code} (not a Kenyan/UTM grid)`, projection: `EPSG:${code}`, units };
}

export interface ProjectReferenceSystemForm {
  /** Datum selector value (any historical spelling is normalised). */
  datum: string
  /** UTM zone 1-60 (ignored for the geographic selection). */
  utmZone: number
  hemisphere: 'N' | 'S'
  verticalDatum?: string
  verticalReference?: 'orthometric' | 'ellipsoidal' | 'trig' | 'local'
  geoidModel?: string
  benchmarkBasis?: string
  calibrationVersion?: string
  calibrationNotes?: string
  /** Visible default: 'grid'. */
  distanceMode?: 'grid' | 'ground'
  /** Adopted combined scale factor; omit to compute per point. */
  combinedScaleFactor?: number
  csfProvenance?: 'computed' | 'surveyor'
  csfReference?: { easting: number; northing: number; height?: number }
  /** Visible default: 3 decimals. */
  coordinatePrecision?: number
  notes?: string
}

/** The stored declaration (PRS + the fields outside the core interface). */
export interface ProjectReferenceSystemRecord {
  prs: ProjectReferenceSystem
  geoidModel?: string
  benchmarkBasis?: string
  calibrationVersion?: string
  calibrationNotes?: string
  csfProvenance?: 'computed' | 'surveyor'
  csfReference?: { easting: number; northing: number; height?: number }
  declaredBy?: string | null
  declaredAt?: string | null
}

// ─── Derivation ─────────────────────────────────────────────────────────────

/** Normalise any historical `projects.datum` spelling to a selector value. */
export function normalizeDatumSelection(raw: string): DatumSelection {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
  if (key === 'arc1960') return 'ARC1960'
  if (key === 'wgs84' || key === 'wgs84utm' || key === 'wgs84/utm') return 'WGS84'
  if (key === 'wgs84geographic' || key === 'wgs84geodetic' || key === 'geographic') {
    return 'WGS84Geographic'
  }
  throw new CrsError(
    'CRS_UNREGISTERED',
    `Unknown datum selection "${raw}". METARDU supports Arc 1960, WGS 84 (UTM), and WGS 84 geographic — register anything else explicitly before declaring it.`,
  )
}

/**
 * Derive the authority code for a settings declaration.
 *
 *  - Arc 1960 → the Kenyan national zones only (EPSG:21036 / 21037, both
 *    southern hemisphere). Any other Arc 1960 zone/hemisphere is unregistered
 *    and throws — the registry never guesses transformation parameters.
 *  - WGS 84 UTM → the 326xx / 327xx family (registered on demand).
 *  - WGS 84 geographic → EPSG:4326, which the PRS then REJECTS as not
 *    projected (plane survey mathematics is undefined in degrees).
 */
export function horizontalCrsFor(
  datum: string,
  utmZone: number,
  hemisphere: 'N' | 'S',
): string {
  const selection = normalizeDatumSelection(datum)
  if (!Number.isInteger(utmZone) || utmZone < 1 || utmZone > 60) {
    throw new CrsError('CRS_INVALID', `UTM zone must be an integer 1-60 (received: ${utmZone}).`)
  }
  if (hemisphere !== 'N' && hemisphere !== 'S') {
    throw new CrsError('CRS_INVALID', `Hemisphere must be N or S (received: ${String(hemisphere)}).`)
  }
  switch (selection) {
    case 'ARC1960':
      if (hemisphere !== 'S') {
        throw new CrsError(
          'CRS_UNREGISTERED',
          `Arc 1960 / UTM zone ${utmZone}${hemisphere} is not registered. The Arc 1960 national zones in METARDU are 36S and 37S — southern hemisphere only; any other zone or hemisphere needs an explicit registerCrs() declaration with verified transformation parameters.`,
        )
      }
      if (utmZone !== 36 && utmZone !== 37) {
        throw new CrsError(
          'CRS_UNREGISTERED',
          `Arc 1960 / UTM zone ${utmZone}S is not registered. The Arc 1960 national zones available in METARDU are 36S and 37S; register any other Arc 1960 zone with its verified transformation parameters first.`,
        )
      }
      return `EPSG:210${utmZone}`
    case 'WGS84':
      return `EPSG:${(hemisphere === 'S' ? 32700 : 32600) + utmZone}`
    case 'WGS84Geographic':
      return WGS84_CRS
  }
}

/**
 * UTM grid → geographic WGS84 (EPSG:4326, [lat, lon]), applying the CRS's
 * registered datum transformation — for Arc 1960 the EPSG-registered
 * EPSG:1122 geocentric translation, which shifts coordinates by ~300 m in
 * East Africa (the ellipsoid-only inverse would mislabel them by that much).
 *
 * The ONE conversion path for any output labelled "WGS84 lat/lon": RFC 7946
 * GeoJSON, KML, GCP files, CSV handoffs. The inverse-UTM-only shortcut
 * (`utmToGeographic`) is ellipsoid-only and must not be used where the
 * result is presented as WGS84 — that mislabels Arc 1960 coordinates by
 * 30–60 m in Kenya.
 *
 * Throws CrsError when the datum is unknown or the zone is outside the
 * registered Arc 1960 zones (fail closed — never guess a transformation).
 */
export function utmToWgs84(
  easting: number,
  northing: number,
  utmZone: number,
  hemisphere: 'N' | 'S',
  datum: string,
): { lat: number; lon: number } {
  const code = horizontalCrsFor(datum, utmZone, hemisphere)
  const [lon, lat] = transformPoint(easting, northing, code, WGS84_CRS)
  return { lat, lon }
}

function requireFinitePositive(value: number | undefined, label: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CrsError(
      'CRS_INVALID',
      `${label} must be a positive, finite number (received: ${String(value)}). Leave it unset to compute factors per point.`,
    )
  }
  return value
}

// ─── Validation / construction ──────────────────────────────────────────────

/**
 * Build the validated project reference system for a declaration.
 *
 * Throws CrsError when the declaration is incomplete, unregistered, not
 * projected, or internally contradictory (e.g. a zone whose authority
 * hemisphere differs from the one the surveyor picked).
 */
export function buildProjectReferenceSystem(
  form: ProjectReferenceSystemForm,
): ProjectReferenceSystem {
  const horizontalCrs = horizontalCrsFor(form.datum, form.utmZone, form.hemisphere)

  const precision =
    form.coordinatePrecision === undefined || form.coordinatePrecision === null
      ? undefined
      : form.coordinatePrecision
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > 6)
  ) {
    throw new CrsError(
      'CRS_INVALID',
      `Coordinate precision must be a whole number of decimals between 0 and 6 (received: ${String(form.coordinatePrecision)}).`,
    )
  }

  const prs = createProjectReferenceSystem({
    horizontalCrs,
    verticalDatum: form.verticalDatum?.trim() || undefined,
    verticalReference: form.verticalReference,
    distanceMode: form.distanceMode ?? 'grid',
    combinedScaleFactor: requireFinitePositive(form.combinedScaleFactor, 'Combined scale factor'),
    coordinatePrecision: precision,
    notes: form.notes?.trim() || undefined,
  })

  // The authority's hemisphere comes from the CRS itself. If it contradicts
  // the surveyor's selection, refuse rather than silently keep one of them.
  if (prs.hemisphere && prs.hemisphere !== form.hemisphere) {
    throw new CrsError(
      'CRS_INVALID',
      `${prs.horizontalCrs} (${prs.horizontalName}) is a ${prs.hemisphere}ern-hemisphere CRS — the project was declared as zone ${form.utmZone}${form.hemisphere}. Change the hemisphere, or declare the matching WGS 84 zone.`,
    )
  }

  return prs
}

// ─── Row mapping (migration 065 columns) ────────────────────────────────────

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  // postgres returns timestamptz as a Date — keep the wire format ISO-8601.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  }
  const str = String(value).trim()
  return str === '' ? undefined : str
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function readDistanceMode(raw: unknown): 'grid' | 'ground' {
  if (raw === 'grid' || raw === 'ground') return raw
  throw new CrsError(
    'CRS_INVALID',
    `Stored reference system has no valid distance mode (received: ${String(raw)}). Re-declare the project reference system.`,
  )
}

function readCoordinatePrecision(raw: unknown): number {
  const precision = Number(raw)
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new CrsError(
      'CRS_INVALID',
      `Stored reference system has an invalid coordinate precision (received: ${String(raw)}). Re-declare the project reference system.`,
    )
  }
  return precision
}

function readVerticalReference(
  raw: unknown,
): 'orthometric' | 'ellipsoidal' | 'trig' | 'local' | undefined {
  if (raw === null || raw === undefined || optionalString(raw) === undefined) return undefined
  if (raw === 'orthometric' || raw === 'ellipsoidal' || raw === 'trig' || raw === 'local') {
    return raw
  }
  throw new CrsError(
    'CRS_INVALID',
    `Stored vertical reference is invalid (received: ${String(raw)}). Re-declare the project reference system.`,
  )
}

/** Build the `project_reference_systems` row for an UPSERT. */
export function toReferenceSystemRow(
  projectId: string,
  record: ProjectReferenceSystemRecord,
  declaredBy: string | null,
): Record<string, unknown> {
  const { prs } = record
  return {
    project_id: projectId,
    horizontal_crs: prs.horizontalCrs,
    horizontal_name: prs.horizontalName,
    datum_name: prs.datum,
    units: prs.units,
    zone: prs.zone ?? null,
    hemisphere: prs.hemisphere ?? null,
    vertical_datum: prs.verticalDatum ?? null,
    vertical_reference: prs.verticalReference ?? null,
    geoid_model: record.geoidModel ?? null,
    benchmark_basis: record.benchmarkBasis ?? null,
    calibration_version: record.calibrationVersion ?? null,
    calibration_notes: record.calibrationNotes ?? null,
    distance_mode: prs.distanceMode,
    combined_scale_factor: prs.combinedScaleFactor ?? null,
    csf_provenance: record.csfProvenance ?? null,
    csf_reference_easting: record.csfReference?.easting ?? null,
    csf_reference_northing: record.csfReference?.northing ?? null,
    csf_reference_height: record.csfReference?.height ?? null,
    coordinate_precision: prs.coordinatePrecision,
    notes: prs.notes ?? null,
    declared_by: declaredBy,
    declared_at: record.declaredAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Read a stored row back. Returns null when no row exists — a project with
 * no declaration has NO reference system, and callers must say so rather
 * than substitute a default.
 *
 * A row whose required fields are missing or corrupt throws instead of being
 * coerced: a mis-stated distance mode or precision would silently change
 * what deliverables claim.
 */
export function fromReferenceSystemRow(
  row: Record<string, unknown> | null | undefined,
): ProjectReferenceSystemRecord | null {
  if (!row) return null
  const crs = optionalString(row.horizontal_crs)
  if (!crs) return null

  const distanceMode = readDistanceMode(row.distance_mode)
  const precision = readCoordinatePrecision(row.coordinate_precision)

  const datumName = optionalString(row.datum_name)
  if (!datumName) {
    throw new CrsError(
      'PRS_INCOMPLETE',
      'Stored reference system has no datum name. Re-declare the project reference system.',
    )
  }

  const provenanceRaw = optionalString(row.csf_provenance)
  let provenance: 'computed' | 'surveyor' | undefined
  if (provenanceRaw !== undefined) {
    if (provenanceRaw !== 'computed' && provenanceRaw !== 'surveyor') {
      throw new CrsError(
        'CRS_INVALID',
        `Stored combined scale factor has invalid provenance (received: ${provenanceRaw}). Re-declare the project reference system.`,
      )
    }
    provenance = provenanceRaw
  }

  const csfRaw = row.combined_scale_factor
  let csf: number | undefined
  if (csfRaw !== null && csfRaw !== undefined) {
    csf = Number(csfRaw)
    if (!Number.isFinite(csf) || csf <= 0) {
      throw new CrsError(
        'CRS_INVALID',
        `Stored combined scale factor is not a positive number (received: ${String(csfRaw)}). Re-declare the project reference system.`,
      )
    }
  }

  const easting = optionalNumber(row.csf_reference_easting)
  const northing = optionalNumber(row.csf_reference_northing)
  const height = optionalNumber(row.csf_reference_height)
  if ((easting === undefined) !== (northing === undefined)) {
    throw new CrsError(
      'CRS_INVALID',
      'Stored scale-factor reference point is incomplete (eastings and northings must both be present). Re-declare the project reference system.',
    )
  }

  const verticalReference = readVerticalReference(row.vertical_reference)

  const hemisphereRaw = row.hemisphere
  if (hemisphereRaw !== null && hemisphereRaw !== undefined && hemisphereRaw !== 'N' && hemisphereRaw !== 'S') {
    throw new CrsError(
      'CRS_INVALID',
      `Stored hemisphere is invalid (received: ${String(hemisphereRaw)}). Re-declare the project reference system.`,
    )
  }
  const hemisphere = hemisphereRaw === 'N' || hemisphereRaw === 'S' ? hemisphereRaw : undefined

  const prs: ProjectReferenceSystem = {
    horizontalCrs: crs,
    horizontalName: optionalString(row.horizontal_name) ?? crs,
    datum: datumName,
    units: 'metres',
    zone: optionalNumber(row.zone),
    hemisphere,
    verticalDatum: optionalString(row.vertical_datum),
    verticalReference,
    distanceMode,
    combinedScaleFactor: csf,
    coordinatePrecision: precision,
    angularUnit: 'degrees',
    notes: optionalString(row.notes),
  }

  const record: ProjectReferenceSystemRecord = {
    prs,
    geoidModel: optionalString(row.geoid_model),
    benchmarkBasis: optionalString(row.benchmark_basis),
    calibrationVersion: optionalString(row.calibration_version),
    calibrationNotes: optionalString(row.calibration_notes),
    csfProvenance: provenance,
    declaredBy:
      row.declared_by === null || row.declared_by === undefined
        ? null
        : String(row.declared_by),
    declaredAt: optionalString(row.declared_at),
  }
  if (easting !== undefined && northing !== undefined) {
    record.csfReference = { easting, northing, height }
  }
  return record
}
