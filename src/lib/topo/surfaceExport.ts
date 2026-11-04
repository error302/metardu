import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { AppError, AuthorizationError, NotFoundError } from '@/lib/api/errors'
import { checkFeatureAccess } from '@/lib/subscription/subscriptionEngine'
import { hashDeliverableContent, registerDeliverable, type DeliverableRevision } from '@/lib/deliverables/deliverableRegister'
import { uploadFile, downloadFile, deleteFile } from '@/lib/storage'
import { logger } from '@/lib/logger'
import { entitiesToDxfString } from '@/lib/drawing/topoEntities'
import { loadSurfaceRevision, hashSurfaceValue } from './surfaceRevision'
import { renderSurfaceDrawingPdf } from './surfaceDrawingPdf'
import { buildSurfaceRevisionDrawing } from './surfaceDrawing'
import { retainedRequestSchema, requestUuid, surfaceExportPayload, type SurfaceExportRequest } from './surfaceRequest'

const conflict = () => new AppError('This export request is bound to different or inconsistent retained work. Recover the original request before starting another.', 409, 'SURFACE_EXPORT_CONFLICT')
interface ExportPacket { bytes: Buffer; filename: string; storagePath: string; contentHash: string; deliverableId: string; revision: number; replayed: boolean; requestHash: string }

async function retainedExport(body: SurfaceExportRequest, userId: string, payloadHash: string, client: PoolClient): Promise<ExportPacket | null> {
  const { rows } = await client.query<DeliverableRevision>(
    `SELECT r.* FROM deliverable_revisions r JOIN deliverables d ON d.id=r.deliverable_id
     WHERE d.project_id=$1 AND r.generator IN ('surface-revision-dxf','surface-revision-pdf') AND r.manifest#>>'{request,projectId}'=$1::text
       AND r.manifest#>>'{request,userId}'=$2 AND r.manifest#>>'{request,id}'=$3 LIMIT 2`, [body.projectId, userId, body.requestId])
  if (!rows.length) return null
  const row = rows[0], request = retainedRequestSchema.safeParse(row.manifest.request && typeof row.manifest.request === 'object'
    ? { id: (row.manifest.request as Record<string, unknown>).id, userId: (row.manifest.request as Record<string, unknown>).userId, payloadHash: (row.manifest.request as Record<string, unknown>).payloadHash } : null)
  if (rows.length !== 1 || !request.success || request.data.id !== body.requestId || request.data.userId !== userId || request.data.payloadHash !== payloadHash
    || row.source_revision !== body.surfaceRevisionId || row.manifest.surface_revision_id !== body.surfaceRevisionId || row.generator !== (body.format==='pdf'?'surface-revision-pdf':'surface-revision-dxf')) throw conflict()
  const folder = `surface-exports/${userId}/${body.projectId}/${body.surfaceRevisionId}/`
  const extension=body.format==='pdf'?'pdf':'dxf'
  if (!row.storage_path?.startsWith(folder) || !new RegExp('^[a-f0-9]{16}-surface-[a-f0-9-]{36}-R[1-9][0-9]*\\.'+extension+'$').test(row.storage_path.slice(folder.length))) throw conflict()
  const files = await client.query<{ user_id: string; project_id: string; filename: string; sha256: string; size_bytes: string | number }>(
    'SELECT user_id,project_id,filename,sha256,size_bytes FROM file_uploads WHERE storage_path=$1', [row.storage_path])
  if (files.rows.length !== 1 || files.rows[0].user_id !== userId || files.rows[0].project_id !== body.projectId || files.rows[0].sha256 !== row.content_hash) throw conflict()
  let bytes: Buffer
  try { bytes = await downloadFile(row.storage_path) } catch { throw new AppError('The retained export file is unavailable. The original register was preserved; no replacement was generated.', 409, 'SURFACE_EXPORT_UNAVAILABLE') }
  if (hashDeliverableContent(bytes) !== row.content_hash || bytes.length !== Number(row.bytes) || bytes.length !== Number(files.rows[0].size_bytes)) throw conflict()
  return { bytes, filename: files.rows[0].filename, storagePath: row.storage_path, contentHash: row.content_hash, deliverableId: row.deliverable_id,
    revision: row.revision, replayed: true, requestHash: payloadHash }
}

export async function executeSurfaceExport(body: SurfaceExportRequest, userId: string, recoverOnly = false, authenticatedEmail?: string): Promise<ExportPacket> {
  if (body.expectedUserId !== userId) throw new AuthorizationError('Sign in as the account that prepared this export request.')
  const payloadHash = hashSurfaceValue(surfaceExportPayload(body))
  let newStoragePath: string | null = null
  try {
    return await db.transaction(async client => {
      const owner = await client.query<{ user_id: string }>('SELECT user_id FROM projects WHERE id=$1 FOR SHARE', [body.projectId])
      if (owner.rows[0]?.user_id !== userId) throw new AuthorizationError('Only the current project owner can generate or recover this export.')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`surface-export:${body.projectId}:${userId}:${body.requestId}`])
      const recovered = await retainedExport(body, userId, payloadHash, client)
      // A retained owner download does not create another paid artifact.
      if (recovered) return recovered
      if (recoverOnly) throw new NotFoundError('No committed export was found for this request.')
      const feature = await checkFeatureAccess(userId, body.format==='pdf'?'full_pdf':'dxf_export', authenticatedEmail)
      if (!feature.allowed) throw new AppError((body.format==='pdf'?'PDF':'DXF')+' export requires an active Pro plan or higher.', 403, 'SURFACE_EXPORT_PLAN_REQUIRED', { requestOutcome: 'rejected', requestId: body.requestId, payloadHash })
      const source = await loadSurfaceRevision(body.projectId, body.surfaceRevisionId, client)
      const drawing = buildSurfaceRevisionDrawing(source), pdf=body.format==='pdf'
      const bytes = pdf ? await renderSurfaceDrawingPdf(drawing) : Buffer.from(entitiesToDxfString(drawing.entities, drawing.layers), 'utf8')
      const extension=pdf?'pdf':'dxf',mime=pdf?'application/pdf':'application/dxf'
      const contentHash = hashDeliverableContent(bytes), filename = `surface-${source.surfaceId}-R${source.revision}.${extension}`
      const folder = `surface-exports/${userId}/${body.projectId}/${body.surfaceRevisionId}`
      const storagePath = await uploadFile(bytes, filename, mime, folder)
      if (!storagePath.startsWith(`${folder}/`) || !new RegExp(`^[a-f0-9]{16}-${filename.replaceAll('.', '\\.')}$`).test(storagePath.slice(folder.length + 1))) throw conflict()
      newStoragePath = storagePath
      if (hashDeliverableContent(await downloadFile(storagePath)) !== contentHash) throw new Error('Stored export bytes did not match the generated artifact.')
      const file = await client.query<{ id: string; user_id: string; project_id: string; storage_path: string; sha256: string; size_bytes: string | number }>(
        `INSERT INTO file_uploads(user_id,storage_path,filename,mime_type,size_bytes,project_id,upload_purpose,sha256)
         VALUES($1,$2,$3,$7,$4,$5,'surface-export',$6) RETURNING id,user_id,project_id,storage_path,sha256,size_bytes`, [userId, storagePath, filename, bytes.length, body.projectId, contentHash, mime])
      const acknowledged = file.rows[0]
      if (file.rowCount !== 1 || file.rows.length !== 1 || !requestUuid.safeParse(acknowledged?.id).success || acknowledged.user_id !== userId || acknowledged.project_id !== body.projectId
        || acknowledged.storage_path !== storagePath || acknowledged.sha256 !== contentHash || Number(acknowledged.size_bytes) !== bytes.length) throw new Error('The stored export was not recorded consistently.')
      const registered = await registerDeliverable({ projectId: body.projectId, documentType: pdf?'survey_plan':'dxf', content: bytes, storagePath,
        sourceRevision: body.surfaceRevisionId, projectCrs: source.crs, title: `${source.name} R${source.revision} — computed draft`,
        generator: pdf?'surface-revision-pdf':'surface-revision-dxf', generatorVersion: '1.3', userId,
        manifest: { request: { id: body.requestId, userId, projectId: body.projectId, payloadHash },
          surface_id: source.surfaceId, surface_revision_id: body.surfaceRevisionId, surface_revision: source.revision,
          input_hash: source.inputHash, output_integrity: source.outputIntegrity, reference_hash: source.snapshot.referenceHash,
          horizontal_crs: source.crs, vertical_datum: source.verticalDatum, units: 'metres', point_count: source.snapshot.observations.length,
          output_format: extension, survey_date: null, reviewer: null, print_at_actual_size: pdf, contour_count: source.contours.length, plan_layout: drawing.layout, field_verified: false, professional_approval: false },
      }, client)
      return { bytes, filename, storagePath, contentHash, deliverableId: registered.deliverable.id, revision: registered.revision.revision, replayed: false, requestHash: payloadHash }
    })
  } catch (error) {
    if (newStoragePath) {
      // COMMIT can succeed even when its acknowledgement is lost. Never erase
      // a committed or uncertain artifact while handling that connection error.
      try {
        const retained = await db.query('SELECT id FROM file_uploads WHERE storage_path=$1 UNION ALL SELECT id FROM deliverable_revisions WHERE storage_path=$1 LIMIT 1', [newStoragePath])
        if (!retained.rows.length) await deleteFile(newStoragePath)
      } catch (cleanupError) { logger.error('[surface-export] retained unconfirmed artifact for recovery', { storagePath: newStoragePath, error: cleanupError }) }
    }
    throw error
  }
}
