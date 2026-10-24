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
import { pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { hashSurfaceValue, loadSurfaceRevision, findSurfaceRequest } from '@/lib/topo/surfaceRevision'
import { surfaceRequestSchema as schema, surfaceBreakline as breakline, surfaceRequestPayload, surfaceReviewValue, requestUuid, requestHash } from '@/lib/topo/surfaceRequest'
import { clipTerrainDomain, locateInTerrainRing } from '@/lib/topo/terrainDomain'

export const dynamic = 'force-dynamic'
interface SpotRow {
  id: string
  point_name: string | null
  easting: number | null
  northing: number | null
  elevation: number | null
  horizontal_crs: string | null
  vertical_datum: string | null
  code: string | null
  source: string | null
  observer_id: string | null
  instrument_id: string | null
  import_session_id: string | null
  observation_date: Date | null
  updated_at: Date | null
}
interface StoredBreakline { name: string | null; breakline_type: string; coordinates: unknown }
interface SurfaceRow { id: string; revision: number | null; current_revision_id: string | null; latest_revision: number | null }
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
  const requestId = req.nextUrl.searchParams.get('requestId'), payloadHash = req.nextUrl.searchParams.get('requestHash')
  if (requestId || payloadHash) {
    const parsed = z.object({ requestId: requestUuid, payloadHash: requestHash }).safeParse({ requestId, payloadHash })
    if (!parsed.success || revisionId) return privateResponse({ error: 'A valid request identity and payload hash are required for recovery.' }, 400)
    const saved = await findSurfaceRequest(projectId, ctx.userId, parsed.data.requestId, parsed.data.payloadHash)
    return saved ? privateResponse({ data: saved }) : privateResponse({ error: 'No committed surface was found for this request.', code: 'SURFACE_REQUEST_NOT_FOUND' }, 404)
  }
  if (revisionId) {
    if (!z.string().uuid().safeParse(revisionId).success) return privateResponse({ error: 'Valid contour revision ID required' }, 400)
    return privateResponse({ data: await loadSurfaceRevision(projectId, revisionId) })
  }
  const { rows } = await db.query(
    `SELECT s.id, s.name, s.description, s.crs, s.vertical_datum, s.status,
       s.current_revision_id AS revision_id, r.revision AS current_revision,
       r.algorithm, r.algorithm_version, r.parameters, r.point_count, r.computed_at
     FROM surfaces s LEFT JOIN surface_revisions r ON r.id = s.current_revision_id AND r.surface_id = s.id
     WHERE s.project_id = $1 ORDER BY s.updated_at DESC`, [projectId])
  const history = await db.query(
    `SELECT r.id AS revision_id, r.surface_id, s.name, r.revision, r.point_count, r.crs, r.computed_at
     FROM surface_revisions r JOIN surfaces s ON s.id = r.surface_id
     WHERE s.project_id = $1 ORDER BY r.computed_at DESC, r.id LIMIT 201`, [projectId])
  return privateResponse({ data: { surfaces: rows, revisions: history.rows.slice(0, 200), historyLimited: history.rows.length > 200 } })
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
  if (body.expectedUserId !== ctx.userId) return privateResponse({ error: 'Sign in as the account that reviewed this request.', code: 'SURFACE_REQUEST_ACCOUNT_CHANGED' }, 403)
  const payloadHash = hashSurfaceValue(surfaceRequestPayload(body))
  try {
    const data = await db.transaction(async client => {
      // Serialize surface revisions for this project. Parent FOR UPDATE also
      // prevents new referenced observations/breaklines during the snapshot.
      const project = await client.query<{ id: string; user_id: string | null }>('SELECT id, user_id FROM projects WHERE id = $1 FOR UPDATE', [projectId])
      if (!project.rows[0]) throw new SurfaceFailure('Project not found', 'NOT_FOUND', 404)
      if (project.rows[0].user_id !== ctx.userId) throw new SurfaceFailure('Only the project owner can compute a saved surface.', 'FORBIDDEN', 403)
      const recovered = await findSurfaceRequest(projectId, ctx.userId, body.requestId, payloadHash, client)
      if (recovered) return recovered
      const referenceRows = await client.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id = $1 FOR SHARE', [projectId])
      // Only an explicit declaration is evidence; legacy defaults are not.
      const reference = resolveStageReference(referenceRows.rows[0], {})
      if (!reference.code) throw new SurfaceFailure('Declare a valid projected project reference system before computing a surface.', 'CRS_UNDECLARED')
      if (!reference.verticalDatum) throw new SurfaceFailure('Declare the project height reference before computing a measured surface.', 'VERTICAL_REFERENCE_UNDECLARED')
      const referenceHash = pointImportReferenceHash(referenceRows.rows[0])
      if (body.expectedReferenceHash && body.expectedReferenceHash !== referenceHash) throw new SurfaceFailure('The project reference changed after source review. Reload and review the source before computing.', 'SURFACE_REFERENCE_CHANGED', 409)
      const crs = reference.code
      const spots = await client.query<SpotRow>(
        `SELECT id, point_name, easting::double precision AS easting, northing::double precision AS northing,
         elevation::double precision AS elevation, horizontal_crs, vertical_datum, code, source,
         observer_id, instrument_id, import_session_id, observation_date, updated_at FROM survey_points
         WHERE project_id = $1 AND deleted_at IS NULL
         ${body.pointIds ? 'AND id = ANY($2::uuid[])' : ''}
         ORDER BY id LIMIT 10001 FOR SHARE`, body.pointIds ? [projectId, body.pointIds] : [projectId])
      if (body.pointIds && (spots.rows.length !== body.pointIds.length || spots.rows.some(row => !body.pointIds?.includes(row.id)))) throw new SurfaceFailure('The selected source points changed or are not available in this project. No observations were substituted.', 'SURFACE_SOURCE_CHANGED', 409)
      if (spots.rows.length < 3 || spots.rows.length > 10000) throw new SurfaceFailure('A surface needs 3–10,000 explicitly reviewed active observations; split larger areas. No rows were truncated.', 'SURFACE_INPUT_INVALID')
      const points = spots.rows.map(row => {
        if (![row.easting, row.northing, row.elevation].every(value => typeof value === 'number' && Number.isFinite(value))) throw new SurfaceFailure(`Observation ${row.point_name || row.id} needs complete finite XYZ measurements. Missing heights remain unknown; explicitly select a reviewed ground dataset.`, 'SURFACE_INPUT_INVALID')
        if (row.horizontal_crs !== crs || row.vertical_datum !== reference.verticalDatum) throw new SurfaceFailure(`Observation ${row.point_name || row.id} has a missing or different source reference. Review or transform the source; changing the project label does not convert measurements.`, 'SURFACE_INPUT_REFERENCE')
        const point = { x: row.easting as number, y: row.northing as number, z: row.elevation as number }
        const range = validateCoordinateRange(point.x, point.y, crs)
        if (!range.valid) throw new SurfaceFailure(range.errors.join('; '), 'SURFACE_INPUT_INVALID')
        return point
      })
      const sourceHash = hashSurfaceValue(surfaceReviewValue(referenceHash, spots.rows.map((row, index) => ({ id: row.id, pointName: row.point_name,
        ...points[index], code: row.code, horizontalCrs: row.horizontal_crs as string, verticalDatum: row.vertical_datum as string }))))
      if (sourceHash !== body.expectedSourceHash) throw new SurfaceFailure('The selected measurements changed after ground review. Reload and review the original observations before computing.', 'SURFACE_SOURCE_CHANGED', 409)
      let lines = body.breaklines
      const breaklineSources: Array<Record<string, unknown>> = []
      if (body.breaklineChains !== undefined) {
        if (body.breaklines !== undefined) throw new SurfaceFailure('Choose measured point chains or explicit coordinate lines for this request; do not mix their sources.', 'BREAKLINE_SOURCE_AMBIGUOUS')
        const pointById = new Map(spots.rows.map((row,index) => [row.id,points[index]]))
        lines = body.breaklineChains.map(chain => {
          const vertices = chain.pointIds.map(id => {
            const point = pointById.get(id)
            if (!point) throw new SurfaceFailure('Every measured breakline vertex must belong to the reviewed selected source. No point was substituted.', 'BREAKLINE_SOURCE_CHANGED')
            return { ...point }
          })
          breaklineSources.push({ kind: 'measured_point_chain', pointIds: chain.pointIds, sourceLabel: chain.sourceLabel, reviewed: true, fieldVerified: false })
          return { name: chain.name, type: chain.type, points: vertices }
        })
      }
      if (lines === undefined && body.useStoredBreaklines) {
        const stored = await client.query<StoredBreakline>(
          'SELECT name, breakline_type, coordinates FROM breaklines WHERE project_id = $1 ORDER BY id LIMIT 2001 FOR SHARE', [projectId])
        if (stored.rows.length) throw new SurfaceFailure('Stored breaklines have no retained coordinate/height-reference declaration. Review their original evidence and supply explicit breaklines with their source reference; no basis was inferred.', 'BREAKLINE_REFERENCE_UNDECLARED')
        const parsed = z.array(breakline).max(2000).safeParse(stored.rows.map(row => ({ name: row.name ?? undefined, type: row.breakline_type, points: row.coordinates })))
        if (!parsed.success) throw new SurfaceFailure('Stored breaklines need complete finite XYZ coordinates and recognized types; review them before computation.', 'SURFACE_INPUT_INVALID')
        lines = parsed.data
      }
      lines ??= []
      if (lines.length && !body.breaklineChains && (!body.breaklineReference || body.breaklineReference.horizontalCrs !== crs || body.breaklineReference.verticalDatum !== reference.verticalDatum || !body.expectedReferenceHash)) throw new SurfaceFailure('Declare the breakline source CRS, height reference and metre units, and bind the reviewed project reference before using explicit breaklines.', 'BREAKLINE_REFERENCE_UNDECLARED')
      if (!body.breaklineChains) for (const line of lines) breaklineSources.push({ kind: 'explicit_declared_coordinates', sourceLabel: line.name || 'Explicit line input', fieldVerified: false })
      for (const line of lines) for (const point of line.points) {
        const range = validateCoordinateRange(point.x, point.y, crs)
        if (!range.valid) throw new SurfaceFailure(range.errors.join('; '), 'SURFACE_INPUT_INVALID')
      }
      if (body.terrainDomain && body.terrainDomain.horizontalCrs !== crs) throw new SurfaceFailure('The terrain definition has a different coordinate basis. Review or transform it explicitly; no project reference was borrowed.', 'SURFACE_DOMAIN_REFERENCE')
      if (body.terrainDomain) for (const region of body.terrainDomain.regions) for (const ring of [region.outer,...region.holes]) for (const point of ring) {
        const range = validateCoordinateRange(point.x,point.y,crs)
        if (!range.valid) throw new SurfaceFailure(range.errors.join('; '), 'SURFACE_DOMAIN_INVALID')
      }
      const sourceTin = buildBreaklineTIN(points, lines as Breakline[])
      const clipped = body.terrainDomain ? clipTerrainDomain(sourceTin,body.terrainDomain) : null
      const tin = clipped ?? sourceTin
      const supportCounts = { inside: 0, outside: 0, exclusion: 0 }
      if (clipped) for (const point of points) {
        const included = clipped.normalizedDomain.regions.some(region => locateInTerrainRing(point,region.outer) >= 0 && region.holes.every(hole => locateInTerrainRing(point,hole) !== 1))
        if (included) supportCounts.inside++
        else if (clipped.normalizedDomain.regions.some(region => region.holes.some(hole => locateInTerrainRing(point,hole) === 1))) supportCounts.exclusion++
        else supportCounts.outside++
      }
      const contours = generateTINContours(tin, { interval: body.interval, maxVertexSpacing: body.resolution })
      const parameters = { interval: body.interval, maxVertexSpacing: body.resolution, indexInterval: 5 }
      const sourceSnapshot = { schemaVersion: 2, sourceAdmissionVersion: 'surface-source-v2', hashAlgorithm: 'sha256-canonical-json-v1',
        request: { id: body.requestId, userId: ctx.userId, payloadHash }, reviewedSourceHash: sourceHash,
        sourceSelection: { mode: body.pointIds ? 'explicit_point_ids' : 'all_active_project_points', pointIds: spots.rows.map(row => row.id) },
        observations: spots.rows.map((row, i) => ({ id: row.id, pointName: row.point_name, ...points[i],
          horizontalCrs: row.horizontal_crs, verticalDatum: row.vertical_datum, code: row.code,
          source: row.source, observerId: row.observer_id, instrumentId: row.instrument_id,
          importSessionId: row.import_session_id, observationDate: row.observation_date, updatedAt: row.updated_at })),
        breaklines: lines, breaklineSources, breaklineReference: lines.length ? body.breaklineChains ? { horizontalCrs: crs, verticalDatum: reference.verticalDatum, units: 'metres' } : body.breaklineReference : null,
        terrainDomain: body.terrainDomain ?? null,
        reference: referenceRows.rows[0], referenceHash, parameters, fieldVerified: false }
      // Hash exactly the JSON value that PostgreSQL will retain. Normalize Date
      // objects and omitted fields before key sorting; JSONB reorders keys.
      const snapshot: unknown = JSON.parse(JSON.stringify(sourceSnapshot))
      const inputHash = createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
      let existing: SurfaceRow | undefined
      const headQuery = `SELECT s.id, s.current_revision_id, r.revision,
        (SELECT MAX(history.revision) FROM surface_revisions history WHERE history.surface_id=s.id) AS latest_revision
        FROM surfaces s LEFT JOIN surface_revisions r ON r.id=s.current_revision_id AND r.surface_id=s.id`
      if (body.surfaceId) {
        existing = (await client.query<SurfaceRow>(
          `${headQuery} WHERE s.id = $1 AND s.project_id = $2 FOR UPDATE OF s`, [body.surfaceId, projectId])).rows[0]
        if (!existing) throw new SurfaceFailure('Surface not found in this project', 'NOT_FOUND', 404)
      } else {
        existing = (await client.query<SurfaceRow>(
          `${headQuery} WHERE s.project_id = $1 AND s.name = $2 FOR UPDATE OF s`, [projectId, body.name])).rows[0]
      }
      if (existing && (existing.current_revision_id === null
        ? existing.latest_revision !== null
        : !Number.isSafeInteger(existing.revision) || (existing.revision ?? 0) < 1 || existing.revision !== existing.latest_revision)) {
        throw new SurfaceFailure('The saved surface head does not match its immutable history. Review the original records before adding a revision.', 'SURFACE_HEAD_CONFLICT', 409)
      }
      let surfaceId = existing?.id
      const revision = Number(existing?.revision ?? 0) + 1
      if (!surfaceId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO surfaces(project_id,name,description,crs,vertical_datum,status,created_by)
           VALUES($1,$2,$3,$4,$5,'COMPUTED',$6) RETURNING id`,
          [projectId, body.name, body.description ?? null, crs, reference.verticalDatum, ctx.userId])
        if (inserted.rowCount !== 1 || inserted.rows.length !== 1 || !z.string().uuid().safeParse(inserted.rows[0]?.id).success) throw new SurfaceFailure('The database did not acknowledge the surface header. The complete computation was rolled back.', 'SURFACE_ACKNOWLEDGEMENT', 500)
        surfaceId = inserted.rows[0].id
      }
      const elevations = tin.points.map(point => point.z)
      const sourceMesh = { points: sourceTin.points, triangles: sourceTin.triangles, constraintEdges: sourceTin.constraintEdges }
      const mesh = clipped ? { points: clipped.points, triangles: clipped.triangles, vertexOrigins: clipped.vertexOrigins, heightBasis: 'retained_parent_tin_faces' } : sourceMesh
      const domain = clipped ? { normalizedDomain: clipped.normalizedDomain, area: clipped.area, derivedVertexCount: clipped.derivedVertexCount,
        definitionHash: hashSurfaceValue(body.terrainDomain), supportCounts, supportSemantics: 'all_selected_observations_support_parent_tin' } : null
      const result = {
        min_elevation: Math.min(...elevations), max_elevation: Math.max(...elevations), contour_lines: contours.length,
        algorithm: 'constrained-tin-isolines', snapshot, mesh,
        ...(domain ? { domain, sourceMesh } : {}),
      }
      const retainedResult = { ...result, outputIntegrity: { algorithm: 'sha256-canonical-json-v1',
        contoursHash: hashSurfaceValue(contours), meshHash: hashSurfaceValue(result.mesh),
        ...(domain ? { domainHash: hashSurfaceValue(domain), sourceMeshHash: hashSurfaceValue(sourceMesh) } : {}) } }
      const savedRevision = await client.query<{ id: string }>(
        `INSERT INTO surface_revisions(surface_id,revision,algorithm,algorithm_version,parameters,
         point_count,breakline_count,triangle_count,crs,input_hash,result,computed_by)
         VALUES($1,$2,'constrained-tin-isolines','2.1',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [surfaceId, revision, JSON.stringify(parameters), points.length, lines.length, tin.triangles.length, crs, inputHash, JSON.stringify(retainedResult), ctx.userId])
      if (savedRevision.rowCount !== 1 || savedRevision.rows.length !== 1 || !z.string().uuid().safeParse(savedRevision.rows[0]?.id).success) throw new SurfaceFailure('The database did not acknowledge the immutable surface revision. The complete computation was rolled back.', 'SURFACE_ACKNOWLEDGEMENT', 500)
      const revisionId = savedRevision.rows[0].id
      const savedContours = await client.query<{ id: string; surface_id: string; surface_revision_id: string }>(
        `INSERT INTO contour_sets(surface_id,surface_revision_id,interval,minor_interval,index_interval,crs,lines,triangle_count)
         VALUES($1,$2,$3,$3,$4,$5,$6,$7) RETURNING id,surface_id,surface_revision_id`,
        [surfaceId, revisionId, body.interval, body.interval * 5, crs, JSON.stringify(contours), tin.triangles.length])
      if (savedContours.rowCount !== 1 || savedContours.rows.length !== 1 || !z.string().uuid().safeParse(savedContours.rows[0]?.id).success || savedContours.rows[0].surface_id !== surfaceId || savedContours.rows[0].surface_revision_id !== revisionId) throw new SurfaceFailure('The database did not acknowledge the contour set for this revision. The complete computation was rolled back.', 'SURFACE_ACKNOWLEDGEMENT', 500)
      const pointer = await client.query<{ id: string; current_revision_id: string }>(
        `UPDATE surfaces SET current_revision_id=$2,status='COMPUTED',crs=$3,vertical_datum=$4,updated_at=NOW()
         WHERE id=$1 AND project_id=$5 AND current_revision_id IS NOT DISTINCT FROM $6::uuid RETURNING id,current_revision_id`,
        [surfaceId, revisionId, crs, reference.verticalDatum, projectId, existing?.current_revision_id ?? null])
      if (pointer.rowCount !== 1 || pointer.rows.length !== 1 || pointer.rows[0].id !== surfaceId || pointer.rows[0].current_revision_id !== revisionId) throw new SurfaceFailure('The database did not acknowledge the new current revision. The complete computation was rolled back.', 'SURFACE_ACKNOWLEDGEMENT', 500)
      // Computation retains its complete line input in the immutable snapshot.
      // It must never delete/replace the project's original breakline register.
      return { surfaceId, revision, revisionId, crs, verticalDatum: reference.verticalDatum,
        pointCount: points.length, breaklineCount: lines.length, contourCount: contours.length, contours, inputHash, snapshotVersion: 2, fieldVerified: false,
        requestId: body.requestId, requestHash: payloadHash, replayed: false }
    })
    return privateResponse({ data }, data.replayed ? 200 : 201)
  } catch (error) {
    const rejection = { requestOutcome: 'rejected', requestId: body.requestId, payloadHash }
    if (error instanceof SurfaceFailure) return privateResponse({ error: error.message, code: error.code, ...(error.status < 500 ? { details: rejection } : {}) }, error.status)
    if (error instanceof RangeError) return privateResponse({ error: error.message, code: 'SURFACE_INPUT_INVALID', details: rejection }, 400)
    throw error
  }
})
