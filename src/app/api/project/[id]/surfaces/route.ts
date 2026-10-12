/** Immutable project surface revisions computed from a locked survey snapshot. */
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { buildBreaklineTIN, type Breakline } from '@/lib/topo/breaklineTIN'
import { generateTINContours } from '@/lib/topo/tinContours'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { validateCoordinateRange } from '@/lib/spatial/projectCrs'

export const dynamic = 'force-dynamic'
const vertex = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
const breakline = z.object({
  name: z.string().trim().max(150).optional(),
  type: z.enum(['hard', 'soft', 'ridge', 'valley']).default('hard'),
  points: z.array(vertex).min(2).max(2001),
})
const schema = z.object({
  surfaceId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(150).default('Existing ground'),
  description: z.string().max(4000).optional(),
  useStoredBreaklines: z.boolean().default(true),
  breaklines: z.array(breakline).max(2000).optional(),
  // The database stores millimetre intervals; do not silently quantize a request.
  interval: z.number().finite().min(0.001).max(1000000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, 'Contour interval must be a multiple of 0.001 m.').default(1),
  resolution: z.number().finite().positive().default(1),
})
interface SpotRow {
  id: string
  point_name: string | null
  easting: number | string | null
  northing: number | string | null
  elevation: number | string
}
interface StoredBreakline { name: string | null; breakline_type: string; coordinates: unknown }
interface SurfaceRow { id: string; revision: number }
class SurfaceFailure extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message) }
}
const privateResponse = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } })

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const projectId = ctx.params.id
  if (!z.string().uuid().safeParse(projectId).success) return privateResponse({ error: 'Valid project ID required' }, 400)
  const access = await requireProjectReadAccess(projectId, ctx.userId)
  if (!access.ok) {
    if (!access.error) throw new Error('Project access check failed without an error response.')
    return access.error
  }
  const revisionId = req.nextUrl.searchParams.get('contourRevision')
  if (revisionId) {
    if (!z.string().uuid().safeParse(revisionId).success) return privateResponse({ error: 'Valid contour revision ID required' }, 400)
    const { rows } = await db.query<{ lines: unknown; crs: string | null }>(
      `SELECT c.lines, c.crs FROM contour_sets c
       JOIN surface_revisions r ON r.id = c.surface_revision_id AND r.surface_id = c.surface_id
       JOIN surfaces s ON s.id = r.surface_id
       WHERE c.surface_revision_id = $1 AND s.project_id = $2 LIMIT 1`, [revisionId, projectId])
    if (!rows[0]) return privateResponse({ error: 'Contour revision not found' }, 404)
    return privateResponse({ data: { contours: rows[0].lines, crs: rows[0].crs, revisionId } })
  }
  const { rows } = await db.query(
    `SELECT s.id, s.name, s.description, s.crs, s.vertical_datum, s.status,
       s.current_revision_id AS revision_id, r.revision AS current_revision,
       r.algorithm, r.algorithm_version, r.parameters, r.result, r.point_count, r.computed_at
     FROM surfaces s LEFT JOIN surface_revisions r ON r.id = s.current_revision_id AND r.surface_id = s.id
     WHERE s.project_id = $1 ORDER BY s.updated_at DESC`, [projectId])
  return privateResponse({ data: { surfaces: rows } })
})

export const POST = apiHandler({ auth: true, schema, rateLimit: { max: 5, windowMs: 60000 } }, async (_req, ctx) => {
  const projectId = ctx.params.id
  if (!z.string().uuid().safeParse(projectId).success) return privateResponse({ error: 'Valid project ID required' }, 400)
  const access = await requireProjectOwnership(projectId, ctx.userId)
  if (!access.ok) {
    if (!access.error) throw new Error('Project ownership check failed without an error response.')
    return access.error
  }
  const body = ctx.body as z.infer<typeof schema>
  try {
    const data = await db.transaction(async client => {
      // Serialize surface revisions for this project. Parent FOR UPDATE also
      // prevents new referenced observations/breaklines during the snapshot.
      const project = await client.query<{ id: string; user_id: string | null }>('SELECT id, user_id FROM projects WHERE id = $1 FOR UPDATE', [projectId])
      if (!project.rows[0]) throw new SurfaceFailure('Project not found', 'NOT_FOUND', 404)
      if (project.rows[0].user_id !== ctx.userId) throw new SurfaceFailure('Only the project owner can compute a saved surface.', 'FORBIDDEN', 403)
      const referenceRows = await client.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id = $1 FOR SHARE', [projectId])
      // Only an explicit declaration is evidence; legacy defaults are not.
      const reference = resolveStageReference(referenceRows.rows[0], {})
      if (!reference.code) throw new SurfaceFailure('Declare a valid projected project reference system before computing a surface.', 'CRS_UNDECLARED')
      const crs = reference.code
      const spots = await client.query<SpotRow>(
        `SELECT id, point_name, easting, northing, elevation FROM survey_points
         WHERE project_id = $1 AND elevation IS NOT NULL ORDER BY id LIMIT 10001 FOR SHARE`, [projectId])
      if (spots.rows.length < 3 || spots.rows.length > 10000) throw new SurfaceFailure('A surface needs 3–10,000 observations with heights; split larger areas.', 'SURFACE_INPUT_INVALID')
      const points = spots.rows.map(row => {
        if (row.easting === null || row.northing === null) throw new SurfaceFailure('Every height observation needs complete coordinates.', 'SURFACE_INPUT_INVALID')
        const point = { x: Number(row.easting), y: Number(row.northing), z: Number(row.elevation) }
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new SurfaceFailure('A surface observation has invalid coordinates or height.', 'SURFACE_INPUT_INVALID')
        const range = validateCoordinateRange(point.x, point.y, crs)
        if (!range.valid) throw new SurfaceFailure(range.errors.join('; '), 'SURFACE_INPUT_INVALID')
        return point
      })
      let lines = body.breaklines
      if (lines === undefined && body.useStoredBreaklines) {
        const stored = await client.query<StoredBreakline>(
          'SELECT name, breakline_type, coordinates FROM breaklines WHERE project_id = $1 ORDER BY id LIMIT 2001 FOR SHARE', [projectId])
        const parsed = z.array(breakline).max(2000).safeParse(stored.rows.map(row => ({ name: row.name ?? undefined, type: row.breakline_type, points: row.coordinates })))
        if (!parsed.success) throw new SurfaceFailure('Stored breaklines need complete finite XYZ coordinates and recognized types; review them before computation.', 'SURFACE_INPUT_INVALID')
        lines = parsed.data
      }
      lines ??= []
      for (const line of lines) for (const point of line.points) {
        const range = validateCoordinateRange(point.x, point.y, crs)
        if (!range.valid) throw new SurfaceFailure(range.errors.join('; '), 'SURFACE_INPUT_INVALID')
      }
      const tin = buildBreaklineTIN(points, lines as Breakline[])
      const contours = generateTINContours(tin, { interval: body.interval, maxVertexSpacing: body.resolution })
      const parameters = { interval: body.interval, maxVertexSpacing: body.resolution, indexInterval: 5 }
      const snapshot = { observations: spots.rows.map((row, i) => ({ id: row.id, pointName: row.point_name, ...points[i] })), breaklines: lines, reference: referenceRows.rows[0], parameters }
      const inputHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
      let existing: SurfaceRow | undefined
      if (body.surfaceId) {
        existing = (await client.query<SurfaceRow>(
          `SELECT s.id, COALESCE(r.revision,0) AS revision FROM surfaces s
           LEFT JOIN surface_revisions r ON r.id = s.current_revision_id AND r.surface_id = s.id
           WHERE s.id = $1 AND s.project_id = $2 FOR UPDATE OF s`, [body.surfaceId, projectId])).rows[0]
        if (!existing) throw new SurfaceFailure('Surface not found in this project', 'NOT_FOUND', 404)
      } else {
        existing = (await client.query<SurfaceRow>(
          `SELECT s.id, COALESCE(r.revision,0) AS revision FROM surfaces s
           LEFT JOIN surface_revisions r ON r.id = s.current_revision_id AND r.surface_id = s.id
           WHERE s.project_id = $1 AND s.name = $2 FOR UPDATE OF s`, [projectId, body.name])).rows[0]
      }
      let surfaceId = existing?.id
      const revision = Number(existing?.revision ?? 0) + 1
      if (!surfaceId) surfaceId = (await client.query<{ id: string }>(
        `INSERT INTO surfaces(project_id,name,description,crs,vertical_datum,status,created_by)
         VALUES($1,$2,$3,$4,$5,'COMPUTED',$6) RETURNING id`,
        [projectId, body.name, body.description ?? null, crs, reference.verticalDatum, ctx.userId])).rows[0].id
      const elevations = tin.points.map(point => point.z)
      const result = {
        min_elevation: Math.min(...elevations), max_elevation: Math.max(...elevations), contour_lines: contours.length,
        algorithm: 'constrained-tin-isolines', snapshot, mesh: { points: tin.points, triangles: tin.triangles, constraintEdges: tin.constraintEdges },
      }
      const revisionId = (await client.query<{ id: string }>(
        `INSERT INTO surface_revisions(surface_id,revision,algorithm,algorithm_version,parameters,
         point_count,breakline_count,triangle_count,crs,input_hash,result,computed_by)
         VALUES($1,$2,'constrained-tin-isolines','2.0',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [surfaceId, revision, JSON.stringify(parameters), points.length, lines.length, tin.triangles.length, crs, inputHash, JSON.stringify(result), ctx.userId])).rows[0].id
      await client.query(
        `INSERT INTO contour_sets(surface_id,surface_revision_id,interval,minor_interval,index_interval,crs,lines,triangle_count)
         VALUES($1,$2,$3,$3,$4,$5,$6,$7)`,
        [surfaceId, revisionId, body.interval, body.interval * 5, crs, JSON.stringify(contours), tin.triangles.length])
      await client.query(
        `UPDATE surfaces SET current_revision_id=$2,status='COMPUTED',crs=$3,vertical_datum=$4,updated_at=NOW() WHERE id=$1`,
        [surfaceId, revisionId, crs, reference.verticalDatum])
      if (body.breaklines !== undefined) {
        await client.query('DELETE FROM breaklines WHERE project_id=$1', [projectId])
        for (const line of body.breaklines) await client.query(
          'INSERT INTO breaklines(project_id,name,breakline_type,coordinates,created_by) VALUES($1,$2,$3,$4,$5)',
          [projectId, line.name ?? null, line.type, JSON.stringify(line.points), ctx.userId])
      }
      return { surfaceId, revision, revisionId, crs, verticalDatum: reference.verticalDatum,
        pointCount: points.length, breaklineCount: lines.length, contourCount: contours.length, contours, inputHash }
    })
    return privateResponse({ data }, 201)
  } catch (error) {
    if (error instanceof SurfaceFailure) return privateResponse({ error: error.message, code: error.code }, error.status)
    if (error instanceof RangeError) return privateResponse({ error: error.message, code: 'SURFACE_INPUT_INVALID' }, 400)
    throw error
  }
})
