import type { AreaData, PointData, ProjectData, TraverseData } from './documentPackage'

interface ComputedStation { pointName?: string; adjustedEasting?: unknown; adjustedNorthing?: unknown }
export interface DocumentProject extends ProjectData {
  area_sqm?: unknown
  boundary_data?: {
    adjustedStations?: ComputedStation[]
    startControl?: { name?: string }
    computation?: { source?: string; computedAt?: string; passes?: boolean; crs?: string; source_revision?: string; acceptance_status?: string; field_verified?: boolean }
    perimeter_m?: unknown
    linear_misclosure?: unknown
    closing_error_e?: unknown
    closing_error_n?: unknown
  } | null
}

function finite(value: unknown, label: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error(`Saved ${label} is missing or invalid. Return to Compute and recompute the field book.`)
  }
  return Number(value)
}

/** Use the saved computation revision, never a sample polygon or a name-sorted point list. */
export function resolveDocumentEvidence(project: DocumentProject, surveyPoints: PointData[], current?: { projectCrs: string | null; fieldBookRevision: string }) {
  const points = surveyPoints.map(p => ({ ...p,
    easting: finite(p.easting, 'easting'), northing: finite(p.northing, 'northing'),
    elevation: p.elevation == null ? undefined : finite(p.elevation, 'elevation'),
  }))
  const boundary = project.boundary_data
  if (!boundary?.computation || !boundary.adjustedStations?.length) {
    return { points, boundaryPoints: [] as PointData[], area: undefined as AreaData | undefined, traverse: undefined as TraverseData | undefined }
  }
  const gridDraft = boundary.computation.source === 'recorded-grid-traverse'
  if (gridDraft && (!current?.projectCrs || current.projectCrs !== boundary.computation.crs
    || current.fieldBookRevision !== boundary.computation.source_revision
    || boundary.computation.acceptance_status !== 'draft_unverified' || boundary.computation.field_verified !== false)) {
    throw new Error('Saved computation does not match the current field-book revision and declared grid. Recompute before generating documents.')
  }
  const boundaryPoints: PointData[] = boundary.adjustedStations.map(p => {
    if (!p.pointName?.trim()) throw new Error('Saved boundary station name is missing. Recompute the field book.')
    return { name: p.pointName, easting: finite(p.adjustedEasting, 'boundary easting'), northing: finite(p.adjustedNorthing, 'boundary northing'),
      // No vertical observation is persisted by the horizontal traverse solver.
      is_control: !gridDraft && p.pointName === boundary.startControl?.name, is_boundary: true } satisfies PointData
  })
  if (boundaryPoints.length < 3 || new Set(boundaryPoints.map(p => p.name)).size !== boundaryPoints.length) {
    throw new Error('Saved boundary needs at least three distinct stations. Recompute the field book.')
  }
  const squareMeters = finite(project.area_sqm, 'area')
  const perimeter = finite(boundary.perimeter_m, 'perimeter')
  const linearError = finite(boundary.linear_misclosure, 'linear misclosure')
  if (squareMeters <= 0 || perimeter <= 0 || linearError < 0) throw new Error('Saved area or closure is invalid. Recompute the field book.')
  const area: AreaData = { squareMeters, hectares: squareMeters / 10000, acres: squareMeters / 4046.8564224, perimeter }
  const traverse: TraverseData = {
    totalDistance: perimeter, linearError,
    closingErrorE: finite(boundary.closing_error_e, 'closing error E'),
    closingErrorN: finite(boundary.closing_error_n, 'closing error N'),
    precisionRatio: linearError === 0 ? Infinity : perimeter / linearError,
    precisionGrade: boundary.computation.passes === true ? 'Numerical closure passed' : boundary.computation.passes === false ? 'Numerical closure failed' : 'Unverified',
    computedAt: boundary.computation.computedAt, source: boundary.computation.source, legs: [],
  }
  return { points: boundaryPoints, boundaryPoints, area, traverse }
}
