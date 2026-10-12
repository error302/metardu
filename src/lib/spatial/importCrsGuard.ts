/**
 * Import-side CRS validation (blueprint §31 P0: "Validate CRS during import").
 *
 * Every route that writes coordinates into project data MUST run the incoming
 * points through validateImportedCoordinates() before INSERT:
 *
 *   - Coordinates that look like longitude/latitude are validated as
 *     EPSG:4326 (field-collect beacons; never silently treated as metres).
 *   - Projected coordinates are range-validated against the project's
 *     declared CRS and FAIL CLOSED with CRS_UNDECLARED when the project has
 *     no datum/zone/hemisphere — METARDU never guesses a zone or a datum.
 *   - When the source file declares its own CRS, it is checked against the
 *     project CRS via validateCrsForProject() (display-only CRS such as
 *     EPSG:3857 are rejected; a different-but-valid CRS produces a
 *     transformation warning that must be surfaced to the surveyor).
 *
 * Range errors (wrong zone, wrong hemisphere, degrees loaded as metres)
 * reject the batch; heuristic warnings (outside the nominal strip, lon/lat
 * in a metres project) are surfaced but do not block the import.
 */

import { CrsError, validateCoordinateRange, validateCrsForProject, WGS84_CRS } from './projectCrs'
import { horizontalCrsFor } from './projectReferenceSystem'

export interface ProjectCrsColumns {
  utm_zone?: string | number | null
  hemisphere?: string | null
  datum?: string | null
}

export interface ImportCoordinate {
  name?: string | null
  x: number
  y: number
}

export interface ImportCrsIssue {
  code: string
  message: string
}

export interface ImportCrsValidation {
  ok: boolean
  /** Derived project CRS (e.g. 'EPSG:21037'), or null when undeclared. */
  projectCrs: string | null
  errors: ImportCrsIssue[]
  warnings: string[]
}

const MAX_SAMPLES = 5

/**
 * Derive the project's EPSG code from its raw CRS columns.
 *
 * Returns { crs: null } when the declaration is incomplete (missing datum,
 * zone or hemisphere) and { crs: null, error } when the declaration is
 * complete but unregistered (e.g. Arc 1960 zone 40N — the registry only
 * holds 36S/37S). Never guesses a zone, hemisphere or datum.
 */
export function projectCrsFromColumns(row: ProjectCrsColumns | null | undefined): {
  crs: string | null
  error: ImportCrsIssue | null
} {
  if (!row) return { crs: null, error: null }
  const datum = String(row.datum ?? '').trim()
  const zoneRaw = row.utm_zone
  const zone =
    zoneRaw === null || zoneRaw === undefined || String(zoneRaw).trim() === ''
      ? NaN
      : Number(zoneRaw)
  const hemiRaw = String(row.hemisphere ?? '').trim().toUpperCase()
  const hemisphere = hemiRaw === 'N' || hemiRaw === 'S' ? hemiRaw : null

  if (!datum || !Number.isFinite(zone) || !hemisphere) {
    return { crs: null, error: null }
  }
  try {
    const crs = horizontalCrsFor(datum, Math.trunc(zone), hemisphere)
    return { crs, error: null }
  } catch (err) {
    if (err instanceof CrsError) {
      return {
        crs: null,
        error: { code: err.code, message: err.message.replace(/^\[[A-Z_]+\]\s*/, '') },
      }
    }
    throw err
  }
}

function looksGeographic(x: number, y: number): boolean {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90
}

export function validateImportedCoordinates(opts: {
  points: ImportCoordinate[]
  projectCrsColumns?: ProjectCrsColumns | null
  /** CRS declared by the source file (e.g. GeoJSON "crs", CSV header). */
  sourceCrs?: string | null
}): ImportCrsValidation {
  const { points, sourceCrs } = opts
  const { crs, error: crsError } = projectCrsFromColumns(opts.projectCrsColumns)

  const errors: ImportCrsIssue[] = []
  const warnings: string[] = []

  const addError = (issue: ImportCrsIssue) => {
    if (!errors.some((e) => e.code === issue.code && e.message === issue.message)) {
      errors.push(issue)
    }
  }

  if (crsError) {
    addError(crsError)
  }

  // Source-declared CRS compatibility (§31 P0: never accept a file whose CRS
  // the project cannot represent without an explicit transformation note).
  if (sourceCrs) {
    if (crsError) {
      // Already failed above — do not duplicate.
    } else if (!crs) {
      addError({
        code: 'CRS_UNDECLARED',
        message:
          'The source file declares a CRS but the project has none. Declare the project datum, UTM zone and hemisphere before importing.',
      })
    } else {
      try {
        const compat = validateCrsForProject(sourceCrs, crs)
        if (compat.level === 'error') {
          addError({ code: 'SOURCE_CRS_INVALID', message: compat.message })
        } else if (compat.level === 'warning') {
          warnings.push(compat.message)
        }
      } catch (err) {
        if (err instanceof CrsError) {
          addError({ code: err.code, message: err.message.replace(/^\[[A-Z_]+\]\s*/, '') })
        } else {
          throw err
        }
      }
    }
  }

  let rangeErrorCount = 0
  const rangeSamples: string[] = []
  let rangeWarningCount = 0
  const rangeWarningSamples: string[] = []
  let geographicCount = 0
  let undeclaredReported = false

  for (const p of points) {
    const label = p.name ? String(p.name) : `(${p.x}, ${p.y})`

    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      rangeErrorCount++
      if (rangeSamples.length < MAX_SAMPLES) rangeSamples.push(`${label}: not a finite number`)
      continue
    }

    if (looksGeographic(p.x, p.y)) {
      geographicCount++
      try {
        const res = validateCoordinateRange(p.x, p.y, WGS84_CRS)
        for (const e of res.errors) {
          rangeErrorCount++
          if (rangeSamples.length < MAX_SAMPLES) rangeSamples.push(`${label}: ${e}`)
        }
        for (const w of res.warnings) {
          rangeWarningCount++
          if (rangeWarningSamples.length < MAX_SAMPLES) rangeWarningSamples.push(`${label}: ${w}`)
        }
      } catch (err) {
        if (err instanceof CrsError) {
          addError({ code: err.code, message: err.message.replace(/^\[[A-Z_]+\]\s*/, '') })
        } else {
          throw err
        }
      }
      continue
    }

    if (crsError) {
      continue // project CRS config error already recorded
    }
    if (!crs) {
      if (!undeclaredReported) {
        undeclaredReported = true
        addError({
          code: 'CRS_UNDECLARED',
          message:
            'Project CRS is undeclared — projected coordinates cannot be validated. Declare the project datum, UTM zone and hemisphere (Project → Reference system) before importing.',
        })
      }
      continue
    }
    try {
      const res = validateCoordinateRange(p.x, p.y, crs)
      for (const e of res.errors) {
        rangeErrorCount++
        if (rangeSamples.length < MAX_SAMPLES) rangeSamples.push(`${label}: ${e}`)
      }
      for (const w of res.warnings) {
        rangeWarningCount++
        if (rangeWarningSamples.length < MAX_SAMPLES) rangeWarningSamples.push(`${label}: ${w}`)
      }
    } catch (err) {
      if (err instanceof CrsError) {
        addError({ code: err.code, message: err.message.replace(/^\[[A-Z_]+\]\s*/, '') })
      } else {
        throw err
      }
    }
  }

  if (rangeErrorCount > 0) {
    const more = rangeErrorCount > rangeSamples.length ? ` (+${rangeErrorCount - rangeSamples.length} more)` : ''
    addError({
      code: 'COORDINATE_OUT_OF_RANGE',
      message: `${rangeErrorCount} coordinate(s) failed range validation${crs ? ` against ${crs}` : ''}: ${rangeSamples.join('; ')}${more}`,
    })
  }

  if (rangeWarningCount > 0) {
    const more =
      rangeWarningCount > rangeWarningSamples.length ? ` (+${rangeWarningCount - rangeWarningSamples.length} more)` : ''
    warnings.push(
      `${rangeWarningCount} coordinate warning(s): ${rangeWarningSamples.join('; ')}${more}`,
    )
  }

  if (geographicCount > 0 && crs && crs !== WGS84_CRS) {
    warnings.push(
      `${geographicCount} coordinate(s) look like longitude/latitude but the project CRS is ${crs} (metres) — confirm they are degrees, not easting/northing.`,
    )
  }
  if (geographicCount > 0 && !crs && !crsError) {
    warnings.push(
      'Project CRS is undeclared; geographic coordinates were validated as EPSG:4326. Declare the project reference system before any projected work.',
    )
  }

  return { ok: errors.length === 0, projectCrs: crs, errors, warnings }
}
