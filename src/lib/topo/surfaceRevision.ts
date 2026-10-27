/** Read a retained surface as one bound record, never from today's point table. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError, NotFoundError } from '@/lib/api/errors'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { retainedRequestSchema, terrainDomainSchema, surfaceBreakline } from './surfaceRequest'
import { normalizeTerrainDomain } from './terrainDomainValidation'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const xyz = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
const observation = xyz.extend({ id: z.string().guid(), pointName: z.string().nullable(),
  horizontalCrs: z.string().min(1), verticalDatum: z.string().min(1), code: z.string().nullable() }).passthrough()
const contoursSchema = z.array(z.object({ elevation: z.number().finite(), isIndex: z.boolean(),
  coordinates: z.array(z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2)) }))
const snapshotSchema = z.object({ schemaVersion: z.literal(2), sourceAdmissionVersion: z.literal('surface-source-v2'),
  hashAlgorithm: z.literal('sha256-canonical-json-v1'), reference: z.record(z.string(), z.unknown()), referenceHash: hash,
  sourceSelection: z.object({ mode: z.enum(['explicit_point_ids', 'all_active_project_points']), pointIds: z.array(z.string().guid()).min(3).max(10000) }),
  observations: z.array(observation).min(3).max(10000), parameters: z.record(z.string(), z.unknown()), fieldVerified: z.literal(false),
  request: retainedRequestSchema.optional(),
  terrainDomain: terrainDomainSchema.nullable().optional(), breaklines: z.array(surfaceBreakline).optional(),
  breaklineSources: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('measured_point_chain'), pointIds: z.array(z.string().guid()).min(2), sourceLabel: z.string().min(1), reviewed: z.literal(true), fieldVerified: z.literal(false) }),
    z.object({ kind: z.literal('explicit_declared_coordinates'), sourceLabel: z.string().min(1), fieldVerified: z.literal(false) }),
  ])).optional(),
}).passthrough()
const domainReportSchema = z.object({ normalizedDomain: z.object({ regions: terrainDomainSchema.shape.regions }), area: z.number().finite().positive(),
  derivedVertexCount: z.number().int().nonnegative(), definitionHash: hash, supportCounts: z.object({ inside: z.number().int().nonnegative(), outside: z.number().int().nonnegative(), exclusion: z.number().int().nonnegative() }),
  supportSemantics: z.literal('all_selected_observations_support_parent_tin') })
const resultSchema = z.object({ snapshot: snapshotSchema, mesh: z.record(z.string(), z.unknown()),
  sourceMesh: z.record(z.string(), z.unknown()).optional(), domain: domainReportSchema.optional(),
  outputIntegrity: z.object({ algorithm: z.literal('sha256-canonical-json-v1'), contoursHash: hash, meshHash: hash, domainHash: hash.optional(), sourceMeshHash: hash.optional() }),
}).passthrough()

/** JSON normalization matches the value persisted as JSONB, including dates. */
export function hashSurfaceValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(JSON.parse(JSON.stringify(value)))).digest('hex')
}

export interface SurfaceRevisionRow {
  surface_id: string; revision_id: string; project_id: string; name: string; revision: number
  crs: string; contour_crs: string; input_hash: string; point_count: number
  parameters: unknown; result: unknown; lines: unknown
}
function invalid(): never {
  throw new AppError('This saved surface lacks consistent source and output evidence. Review or recompute a new revision; the retained original was not changed.', 409, 'SURFACE_REVISION_UNVERIFIED')
}

export function verifySurfaceRevision(row: SurfaceRevisionRow) {
  const result = resultSchema.safeParse(row.result), contours = contoursSchema.safeParse(row.lines)
  if (!result.success || !contours.success) return invalid()
  // Validate shape without reserializing Zod's stripped/reordered projection.
  const raw = row.result as z.infer<typeof resultSchema>
  const snapshot = result.data.snapshot
  const reference = resolveStageReference(snapshot.reference, {})
  if (snapshot.breaklineSources) {
    if (!snapshot.breaklines || snapshot.breaklines.length !== snapshot.breaklineSources.length) return invalid()
    const byId = new Map(snapshot.observations.map(point => [point.id,point]))
    for (let index=0; index<snapshot.breaklineSources.length; index++) {
      const source=snapshot.breaklineSources[index],line=snapshot.breaklines[index]
      if (source.kind !== 'measured_point_chain') continue
      if (source.pointIds.length !== line.points.length || source.pointIds.some((id,i) => {
        const point=byId.get(id),vertex=line.points[i]
        return !point || point.x!==vertex.x || point.y!==vertex.y || point.z!==vertex.z
      })) return invalid()
    }
  }
  if (snapshot.terrainDomain) {
    const domain=result.data.domain, integrity=result.data.outputIntegrity
    let normalizedDomain
    try { normalizedDomain=normalizeTerrainDomain(snapshot.terrainDomain) }
    catch { return invalid() }
    if (!domain || !raw.sourceMesh || snapshot.terrainDomain.horizontalCrs!==row.crs
      || integrity.domainHash!==hashSurfaceValue(raw.domain) || integrity.sourceMeshHash!==hashSurfaceValue(raw.sourceMesh)
      || domain.definitionHash!==hashSurfaceValue(raw.snapshot.terrainDomain)
      || hashSurfaceValue(domain.normalizedDomain)!==hashSurfaceValue(normalizedDomain)
      || domain.supportCounts.inside+domain.supportCounts.outside+domain.supportCounts.exclusion!==snapshot.observations.length) return invalid()
  } else if (result.data.domain || raw.sourceMesh || result.data.outputIntegrity.domainHash || result.data.outputIntegrity.sourceMeshHash) return invalid()
  if (!reference.code || !reference.verticalDatum || reference.code !== row.crs || row.contour_crs !== row.crs
    || snapshot.reference.project_id !== row.project_id
    || pointImportReferenceHash(snapshot.reference) !== snapshot.referenceHash
    || hashSurfaceValue(raw.snapshot) !== row.input_hash
    || hashSurfaceValue(row.lines) !== result.data.outputIntegrity.contoursHash
    || hashSurfaceValue(raw.mesh) !== result.data.outputIntegrity.meshHash
    || hashSurfaceValue(row.parameters) !== hashSurfaceValue(snapshot.parameters)
    || row.point_count !== snapshot.observations.length
    || new Set(snapshot.sourceSelection.pointIds).size !== snapshot.observations.length
    || new Set(snapshot.observations.map(point => point.id)).size !== snapshot.observations.length
    || snapshot.observations.some(point => !snapshot.sourceSelection.pointIds.includes(point.id)
      || point.horizontalCrs !== reference.code || point.verticalDatum !== reference.verticalDatum)) return invalid()
  return { surfaceId: row.surface_id, revisionId: row.revision_id, projectId: row.project_id,
    name: row.name, revision: row.revision, crs: row.crs, verticalDatum: reference.verticalDatum,
    inputHash: row.input_hash, outputIntegrity: result.data.outputIntegrity,
    snapshot: raw.snapshot, contours: contours.data, parameters: snapshot.parameters, domain: result.data.domain ?? null, fieldVerified: false as const }
}

/** Caller must authorize project read/ownership before invoking. Exact join, no latest fallback. */
export async function loadSurfaceRevision(projectId: string, revisionId: string, client: Pick<typeof db, 'query'> = db) {
  const { rows } = await client.query<SurfaceRevisionRow>(
    `SELECT s.id AS surface_id, s.project_id, s.name, r.id AS revision_id, r.revision,
      r.crs, r.input_hash, r.point_count, r.parameters, r.result, c.crs AS contour_crs, c.lines
     FROM surface_revisions r JOIN surfaces s ON s.id = r.surface_id
     JOIN contour_sets c ON c.surface_revision_id = r.id AND c.surface_id = r.surface_id
     WHERE s.project_id = $1 AND r.id = $2`, [projectId, revisionId])
  if (!rows.length) throw new NotFoundError('Saved surface revision not found in this project.')
  if (rows.length !== 1) return invalid()
  return verifySurfaceRevision(rows[0])
}

export async function findSurfaceRequest(projectId: string, userId: string, requestId: string, payloadHash: string, client: Pick<typeof db, 'query'> = db) {
  const { rows } = await client.query<{ revision_id: string; request: unknown }>(
    `SELECT r.id AS revision_id, r.result->'snapshot'->'request' AS request
     FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id
     WHERE s.project_id=$1 AND r.result#>>'{snapshot,reference,project_id}'=$1::text
       AND r.result#>>'{snapshot,request,userId}'=$2 AND r.result#>>'{snapshot,request,id}'=$3 LIMIT 2`, [projectId, userId, requestId])
  if (!rows.length) return null
  const request = retainedRequestSchema.safeParse(rows[0].request)
  if (rows.length !== 1 || !request.success || request.data.id !== requestId || request.data.userId !== userId || request.data.payloadHash !== payloadHash) {
    throw new AppError('This request identity is already bound to different or inconsistent saved work. Recover the original request before starting another.', 409, 'SURFACE_REQUEST_CONFLICT')
  }
  const saved = await loadSurfaceRevision(projectId, rows[0].revision_id, client)
  return { ...saved, requestId, requestHash: payloadHash, replayed: true as const, snapshotVersion: 2,
    pointCount: saved.snapshot.observations.length, contourCount: saved.contours.length,
    breaklineCount: Array.isArray(saved.snapshot.breaklines) ? saved.snapshot.breaklines.length : 0 }
}
