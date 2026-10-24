/**
 * Statutory Gate — Project Data Loader
 * ====================================
 *
 * Fetches project data from the database and assembles it into the
 * StatutoryGateInput shape required by runStatutoryGate().
 *
 * This is the integration layer between the project database and the
 * pure-function gate. Keeping it separate from the gate itself means
 * the gate remains trivially testable (no DB mocking required) while
 * this loader can be tested with a test database.
 *
 * Usage:
 *   import { loadGateInputForProject } from '@/lib/validation/statutoryGateLoader'
 *   import { runStatutoryGate } from '@/lib/validation/statutoryGate'
 *
 *   const input = await loadGateInputForProject(projectId)
 *   const result = runStatutoryGate(input)
 *   if (!result.passed) {
 *     // refuse export, show result.violations
 *   }
 */

import { db } from '@/lib/db'
import type { SurveyPoint } from '@/types/surveyPoint'
import type { SurveyType } from '@/types/project'
import type { StatutoryGateInput } from './statutoryGate'

// ─── Types matching DB row shapes ───────────────────────────────────────

interface ProjectRow {
  id: string
  boundary_data?: Record<string, unknown>
  survey_type: string | null
  utm_zone: number | null
  hemisphere: string | null
}

interface TraverseRow {
  id: string
  evidence: Record<string, unknown>
}

interface TraverseCoordinateRow {
  station: string
  easting: number | string
  northing: number | string
  rl: number | string | null
}

interface FieldBookEntryRow {
  row_index: number
  station: string | null
  raw_data: Record<string, unknown> | null
}

interface ParcelRow {
  id: string
  parcel_number: string | null
  boundary_geometry: { type?: string; coordinates?: unknown } | null
}

// ─── Helpers ────────────────────────────────────────────────────────────

function normalizeSurveyType(raw: string | null): SurveyType {
  const v = (raw ?? '').toLowerCase()
  if (v.includes('cadastral') || v.includes('boundary')) return 'cadastral'
  if (v.includes('construction') || v.includes('building') || v.includes('pile')) return 'construction'
  if (v.includes('engineering') || v.includes('road')) return 'engineering'
  if (v.includes('geodetic') || v.includes('control')) return 'geodetic'
  if (v.includes('drone') || v.includes('uav')) return 'drone'
  if (v.includes('deformation') || v.includes('monitor')) return 'deformation'
  return 'topographic'
}

/**
 * Extract traverse station count from field book entries.
 * Each unique station name counts as one station.
 */
function countStations(entries: FieldBookEntryRow[]): number {
  const stations = new Set<string>()
  for (const e of entries) {
    if (e.station) stations.add(e.station)
    else if (e.raw_data?.station) stations.add(String(e.raw_data.station))
  }
  return stations.size
}

function evidenceNumber(value: unknown): number {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    ? Number(value) : NaN
}

/** Normalize explicit coordinates; unknown ordinates remain invalid. */
function parseBoundaryPoints(raw: unknown): {
  vertices: SurveyPoint[]
} {
  let pts: Array<{ easting?: number; northing?: number; name?: string }> = []

  if (Array.isArray(raw)) {
    pts = raw as typeof pts
  } else if (typeof raw === 'string') {
    try {
            const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) pts = parsed as typeof pts
    } catch {
      // not JSON — ignore
    }
  }

  const vertices: SurveyPoint[] = pts.map((p, i) => ({
    name: p?.name ?? `P${i + 1}`,
    easting: evidenceNumber(p?.easting),
    northing: evidenceNumber(p?.northing),
  }))
  return { vertices }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Load project data from the database and assemble it into a
 * StatutoryGateInput ready for runStatutoryGate().
 *
 * Returns null if the project cannot be found.
 *
 * Failed evidence reads are retained as blocking, unassessed issues.
 * Absent observations never acquire invented zero errors or coordinates.
 */
export async function loadGateInputForProject(
  projectId: string
): Promise<StatutoryGateInput | null> {
  // 1. Project row
  const projectRes = await db.query(
    'SELECT id, survey_type, utm_zone, hemisphere, boundary_data FROM projects WHERE id = $1',
    [projectId]
  )
  if (projectRes.rows.length === 0) return null
  const project = projectRes.rows[0] as ProjectRow
  const surveyType = normalizeSurveyType(project.survey_type)
  const evidenceIssues: NonNullable<StatutoryGateInput['evidenceIssues']> = []

  const boundary = project.boundary_data
  const computation = boundary?.computation
  const hasFieldComputation = computation !== null && typeof computation === 'object' && 'source' in computation && computation.source === 'field-observations'
  // 2. Prefer the explicit project computation. Legacy coordinates alone
  // cannot establish observed closure, and canonical parcel_traverses has
  // no linear_misclosure/angular_misclosure columns.
  let traverse: StatutoryGateInput['traverse'] | undefined
  if (boundary && hasFieldComputation) {
    const ratioText = String(boundary.precision_ratio ?? '').replace(/,/g, '').replace(/^1\s*:\s*/, '').trim()
    traverse = {
      stationCount: Array.isArray(boundary.adjustedStations) ? boundary.adjustedStations.length : 0,
      angularMisclosureSeconds: boundary.angular_misclosure == null ? undefined : evidenceNumber(boundary.angular_misclosure),
      linearErrorM: evidenceNumber(boundary.linear_misclosure), totalDistanceM: evidenceNumber(boundary.perimeter_m),
      precisionRatio: ratioText === '∞' ? Number.MAX_SAFE_INTEGER : evidenceNumber(ratioText),
    }
  } else try {
    const traverseRes = await db.query(
      `SELECT pt.id, to_jsonb(pt) AS evidence
       FROM parcel_traverses pt
       WHERE pt.project_id = $1
       ORDER BY pt.created_at DESC LIMIT 1`,
      [projectId]
    )
    if (traverseRes.rows.length > 0) {
      const t = traverseRes.rows[0] as TraverseRow
      const coordsRes = await db.query(
        'SELECT station_name AS station, easting, northing, elevation AS rl FROM traverse_coordinates WHERE traverse_id = $1 ORDER BY created_at, id',
        [t.id]
      )
      const stationCount = coordsRes.rows.length

      const coords = coordsRes.rows as TraverseCoordinateRow[]
      if (coords.some(c => !Number.isFinite(evidenceNumber(c.easting)) || !Number.isFinite(evidenceNumber(c.northing)))) {
        evidenceIssues.push({ field: 'traverse.coordinates', message: 'Retained traverse coordinates are incomplete or invalid.' })
      }
      // Read retained results when present in an upgraded schema. Do not
      // manufacture closure from an alphabetical adjusted-coordinate loop.
      const totalDistanceM = evidenceNumber(t.evidence?.total_perimeter)
      const linearErrorM = evidenceNumber(t.evidence?.linear_error)
      // precision_ratio in DB is typically stored as the large number (e.g. 5000 = 1:5000)
      // If it's stored as a decimal (e.g. 0.0002), convert.
      const storedRatio = evidenceNumber(t.evidence?.precision_ratio)
      const precisionRatio = storedRatio > 0 && storedRatio < 1
        ? 1 / storedRatio
        : storedRatio

      const angularMisclosureSeconds = t.evidence?.angular_misclosure == null ? undefined : evidenceNumber(t.evidence.angular_misclosure)

      traverse = {
        stationCount,
        angularMisclosureSeconds,
        linearErrorM,
        totalDistanceM,
        precisionRatio,
      }
    }
  } catch {
    evidenceIssues.push({ field: 'traverse', message: 'Traverse evidence could not be loaded. Restore it before generating a submission.' })
  }

  // 3. Field book entries (for station count fallback if no traverse)
  if (!traverse) {
    try {
      const fbRes = await db.query(
        'SELECT row_index, station, raw_data FROM project_fieldbook_entries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY row_index ASC',
        [projectId]
      )
      const entries = fbRes.rows as FieldBookEntryRow[]
      if (entries.length > 0) {
        traverse = {
          stationCount: countStations(entries),
          angularMisclosureSeconds: undefined,
          linearErrorM: NaN,
          totalDistanceM: NaN,
          precisionRatio: NaN,
        }
      }
    } catch {
      evidenceIssues.push({ field: 'traverse', message: 'Field book evidence could not be loaded. No traverse assessment is available.' })
    }
  }

  // 4. Parcels + parent parcel (for cadastral)
  let parcels: StatutoryGateInput['parcels'] | undefined
  try {
    const parcelRes = await db.query(
      'SELECT id, parcel_number, ST_AsGeoJSON(geom)::jsonb AS boundary_geometry FROM parcels WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId]
    )
    if (parcelRes.rows.length > 0) {
      const parcelRows = parcelRes.rows as ParcelRow[]
      const parsed = parcelRows.map(p => {
        const geometry = p.boundary_geometry
        const rings = geometry?.coordinates
        if (geometry?.type !== 'Polygon' || !Array.isArray(rings) || rings.length !== 1 || !Array.isArray(rings[0])) {
          evidenceIssues.push({ field: 'parcels', message: 'A complete single-ring parcel boundary is required for these checks. Holes and multipart boundaries need a supported review workflow.' })
          return { vertices: [] }
        }
        const ring: unknown[] = rings[0] as unknown[]
        // PostGIS polygons repeat the first vertex; the gate uses open rings.
        const points = ring.length > 1 && JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1]) ? ring.slice(0, -1) : ring
        return parseBoundaryPoints(points.map((point: unknown) => {
          const pair: unknown[] = Array.isArray(point) ? point as unknown[] : []
          return { easting: pair[0], northing: pair[1] }
        }))
      })
      parcels = parsed.map((p, i) => ({
        vertices: p.vertices,
        parcelNumber: parcelRows[i].parcel_number ?? `Parcel ${i + 1}`,
      }))

      // Resulting parcels are not authoritative parent references.
      // A separate retained parent-evidence workflow is still required.
    }
  } catch {
    evidenceIssues.push({ field: 'parcels', message: 'Parcel evidence could not be loaded. Boundary checks are unassessed.' })
  }

  // A saved field-observation computation can define this project's single
  // boundary when no separate resulting parcels exist. It is never a parent.
  if (!parcels && boundary && hasFieldComputation && Array.isArray(boundary.adjustedStations)) {
    const points = boundary.adjustedStations.map((point: unknown) => {
      const value = point !== null && typeof point === 'object' ? point as Record<string, unknown> : {}
      return { name: value.pointName, easting: value.adjustedEasting, northing: value.adjustedNorthing }
    })
    parcels = [{ vertices: parseBoundaryPoints(points).vertices, parcelNumber: String(boundary.parcelNumber ?? '') }]
  }

  // 5. The server caller supplies the project owner's resolved profile.
  // Empty values remain blockers until resolved; no placeholder credentials.
  const surveyor = {
    name: '',
    licenseNumber: '',
  }

  return {
    surveyType,
    traverse,
    parcels,
    evidenceIssues,
    surveyor,
  }
}

/**
 * Merge a partial gate input (typically containing the surveyor identity
 * from the auth session) over the input loaded from the database.
 *
 * This is the pattern callers should use:
 *   const loaded = await loadGateInputForProject(projectId)
 *   if (!loaded) throw new Error('Project not found')
 *   const input = mergeGateInput(loaded, { surveyor: sessionSurveyor })
 *   const result = runStatutoryGate(input)
 */
export function mergeGateInput(
  base: StatutoryGateInput,
  override: Partial<StatutoryGateInput>
): StatutoryGateInput {
  const result: StatutoryGateInput = {
    surveyType: override.surveyType ?? base.surveyType,
    surveyor: {
      name: override.surveyor?.name ?? base.surveyor.name,
      licenseNumber: override.surveyor?.licenseNumber ?? base.surveyor.licenseNumber,
    },
    traverse: override.traverse ?? base.traverse,
    leveling: override.leveling ?? base.leveling,
    parcels: override.parcels ?? base.parcels,
    parentParcel: override.parentParcel ?? base.parentParcel,
    engineering: override.engineering ?? base.engineering,
    rimOverlaps: override.rimOverlaps ?? base.rimOverlaps,
    submissionType: override.submissionType ?? base.submissionType,
    toleranceProfileOverride: override.toleranceProfileOverride ?? base.toleranceProfileOverride,
    areaToleranceHectares: override.areaToleranceHectares ?? base.areaToleranceHectares,
    evidenceIssues: [...(base.evidenceIssues ?? []), ...(override.evidenceIssues ?? [])],
    requiredEvidence: [...new Set([...(base.requiredEvidence ?? []), ...(override.requiredEvidence ?? [])])],
  }
  return result
}
