import { z } from 'zod'
import { parseCoordinateCsv } from '@/lib/import/totalStation/parseCoordinateCsv'
import { resolveDeclaredStageReference, type StageReference } from '@/lib/workspaces/stageReference'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import type { SurveyPointWithCode } from './featureCodes'

export interface DrawingSourcePoint extends SurveyPointWithCode { id: string; description?: string }
export const MAX_DRAWING_POINTS = 2500
const finite = z.number().finite()
const rowSchema = z.object({ id: z.string().min(1), point_name: z.string().min(1), easting: finite, northing: finite,
  elevation: finite.nullable(), code: z.string().nullable(), description: z.string().nullable(),
  horizontal_crs: z.string().min(1), vertical_datum: z.string().nullable() })
const pointsSchema = z.object({ data: z.array(rowSchema).max(MAX_DRAWING_POINTS), meta: z.object({ project_id: z.string() }) })
const contextSchema = z.object({ data: z.object({ referenceSystem: z.unknown(), referenceHash: z.string().regex(/^[a-f0-9]{64}$/) }) })

export function drawingReferenceIssue(points: DrawingSourcePoint[], crs: string, verticalDatum: string): string | null {
  try {
    const info = assertProjectedCrs(crs)
    if (info.units !== 'metres') return 'This drawing requires a projected CRS in metres. Transform the source explicitly before drawing.'
    if (points.some(point => point.elevation !== undefined) && !verticalDatum.trim()) return 'Declare the height reference before exporting measured heights.'
    for (const point of points) {
      const range = validateCoordinateRange(point.easting, point.northing, info.code)
      if (!range.valid) return `${point.pointNumber ?? point.id}: ${range.errors.join('; ')}`
    }
    return null
  } catch { return 'Declare a registered projected CRS in metres before exporting. A label does not transform coordinates.' }
}

export function readProjectDrawingSource(projectId: string, pointsValue: unknown, contextValue: unknown): { points: DrawingSourcePoint[]; reference: StageReference; referenceHash: string } {
  const response = pointsSchema.safeParse(pointsValue), context = contextSchema.safeParse(contextValue)
  if (!response.success || !context.success) throw new Error(`Project drawing needs complete finite coordinates, retained IDs and recorded references (at most ${MAX_DRAWING_POINTS} points). No rows were omitted.`)
  if (response.data.meta.project_id !== projectId) throw new Error('The returned points do not match this project. No drawing was loaded.')
  const reference = resolveDeclaredStageReference(context.data.data.referenceSystem)
  if (!reference.code || reference.source !== 'declared') throw new Error('Declare the project reference before composing its drawing.')
  const ids = new Set<string>(), names = new Set<string>()
  const points = response.data.data.map(row => {
    if (ids.has(row.id) || names.has(row.point_name)) throw new Error('Duplicate project point identities require review. No rows were merged.')
    ids.add(row.id); names.add(row.point_name)
    if (row.horizontal_crs !== reference.code || row.elevation !== null && row.vertical_datum !== reference.verticalDatum) throw new Error('Observation references differ from the project declaration. Review or transform the source; changing a label does not convert measurements.')
    return { id: row.id, pointNumber: row.point_name, easting: row.easting, northing: row.northing, elevation: row.elevation ?? undefined, code: row.code || 'UNK', description: row.description ?? '' }
  })
  const issue = drawingReferenceIssue(points, reference.code, reference.verticalDatum ?? '')
  if (issue) throw new Error(issue)
  return { points, reference, referenceHash: context.data.data.referenceHash }
}

/** Shared coordinate CSV authority: reject a bad file atomically, retaining zero. */
export function readDrawingCsv(text: string): DrawingSourcePoint[] {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('Import at most 2 MB of coordinate text.')
  const parsed = parseCoordinateCsv(text)
  if (parsed.errors.length) throw new Error(parsed.errors.join('; '))
  if (!parsed.rawPoints.length || parsed.rawPoints.length > MAX_DRAWING_POINTS) throw new Error(`Import between 1 and ${MAX_DRAWING_POINTS} points. No rows were truncated.`)
  const names = new Set<string>()
  return parsed.rawPoints.map((point, index) => {
    if (!point.id || names.has(point.id) || !Number.isFinite(point.easting) || !Number.isFinite(point.northing) || point.elevation !== undefined && !Number.isFinite(point.elevation)) throw new Error(`Record ${point.sourceRow}: missing, duplicate or invalid measurements. No rows were imported.`)
    names.add(point.id)
    return { id: `csv-${index}`, pointNumber: point.id, easting: point.easting as number, northing: point.northing as number, elevation: point.elevation, code: point.code || 'UNK' }
  })
}
