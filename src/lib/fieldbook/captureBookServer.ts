import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { offlineObservationSchema, offlineObservationSource, offlineObservationInputHash, fieldObservationHash } from '@/lib/field/observationCapture'
import { captureBookRequestSchema, createCaptureDraftData, type BookCaptureSource } from './captureDraft'
export type { CaptureBookRequest } from './captureDraft'
type Connection = Parameters<Parameters<typeof db.transaction>[0]>[0]
const conflict = (message: string) => new AppError(message, 409, 'FIELD_CAPTURE_BOOK_CONFLICT')

async function requireRecordingProject(client: Connection, projectId: string) {
  const project = await client.query('SELECT user_id FROM public.lock_project_for_read($1)', [projectId])
  if (!project.rows.length) throw new AppError('Project not found.', 404, 'FIELD_CAPTURE_PROJECT')
  const access = await client.query<{ allowed: boolean }>('SELECT public.field_observation_project_access($1,true) AS allowed', [projectId])
  if (access.rows[0]?.allowed !== true) throw new AppError('Current field-recording access is required to review sources for a book.', 403, 'FIELD_CAPTURE_ACCESS')
}

async function verifiedSources(client: Connection, projectId: string, selected: { batchId: string; inputHash?: string }[]): Promise<BookCaptureSource[]> {
  const batches = (await client.query<{ id: string; created_by: string | null; quality_metadata: Record<string, unknown> }>(
    "SELECT id,created_by,quality_metadata FROM observation_batches WHERE project_id=$1 AND id=ANY($2::uuid[]) AND quality_metadata->>'kind'='offline_field_observation' FOR SHARE", [projectId, selected.map(source => source.batchId)])).rows
  if (batches.length !== selected.length) throw conflict('One or more selected raw captures are unavailable. No draft was created.')
  const observationIds = batches.map(batch => z.string().guid().parse(batch.quality_metadata.observationId))
  const observations = (await client.query<Record<string, unknown>>('SELECT * FROM survey_observations WHERE project_id=$1 AND id=ANY($2::uuid[]) FOR SHARE', [projectId, observationIds])).rows
  return selected.map(selection => {
    const batch = batches.find(item => item.id === selection.batchId)
    if (!batch) throw conflict('A selected source changed during review.')
    const metadata = batch.quality_metadata
    const raw = offlineObservationSource(offlineObservationSchema.parse(metadata.raw))
    const hash = offlineObservationInputHash(raw)
    const stored = observations.find(row => row.id === metadata.observationId)
    if (metadata.kind !== 'offline_field_observation' || metadata.inputHash !== hash || selection.inputHash && selection.inputHash !== hash
      || raw.projectId !== projectId || !stored || stored.client_id !== raw.id || stored.project_id !== projectId
      || fieldObservationHash(stored) !== metadata.storedObservationHash || metadata.capturedBy !== (raw.ownerId ?? null)) {
      throw conflict('The raw source or observation no longer matches its original receipt. Retain it for review; no draft was created.')
    }
    const projectReference = metadata.projectReference
    if (projectReference != null && (typeof projectReference !== 'object' || Array.isArray(projectReference))) throw conflict('The retained project reference is unreadable.')
    return { batchId: batch.id, observationId: String(stored.id), projectId, clientId: String(raw.id), inputHash: hash,
      capturedBy: raw.ownerId as string | undefined ?? null, raw, projectReference: projectReference as Record<string, unknown> | null ?? null }
  })
}

export async function createBookFromCaptures(actorId: string, value: unknown): Promise<{ book: Record<string, unknown>; replayed: boolean }> {
  const input = captureBookRequestSchema.parse(value)
  const requestHash = fieldObservationHash(input)
  return db.transaction(async client => {
    await requireRecordingProject(client, input.projectId)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`capture-book:${input.projectId}:${input.bookId}`])
    const previous = (await client.query<Record<string, unknown>>('SELECT * FROM fieldbooks WHERE id=$1 FOR UPDATE', [input.bookId])).rows[0]
    if (previous) {
      const data = previous.data as { sourceImport?: { requestHash?: string } } | null
      if (previous.user_id !== actorId || previous.project_id !== input.projectId || data?.sourceImport?.requestHash !== requestHash) throw conflict('This book ID already belongs to a different draft. No existing book was overwritten.')
      return { book: previous, replayed: true }
    }
    const sources = await verifiedSources(client, input.projectId, input.sources)
    let data: Record<string, unknown>
    try { data = createCaptureDraftData(input.type, sources, { actorId, reviewedAt: new Date().toISOString(), requestHash, bearingEncoding: input.bearingEncoding }) }
    catch (error) { throw new AppError(error instanceof Error ? error.message : 'These captures cannot form this book.', 422, 'FIELD_CAPTURE_MAPPING') }
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 10 * 1024 * 1024) throw new AppError('The retained sources exceed 10 MB. Select fewer captures for this draft.', 422, 'FIELD_CAPTURE_SIZE')
    const saved = (await client.query<Record<string, unknown>>('INSERT INTO fieldbooks (id,project_id,user_id,type,name,data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [input.bookId, input.projectId, actorId, input.type, input.name, JSON.stringify(data)])).rows
    if (saved.length !== 1 || saved[0].id !== input.bookId || saved[0].user_id !== actorId || saved[0].project_id !== input.projectId || fieldObservationHash(saved[0].data) !== fieldObservationHash(data)) {
      throw new AppError('The server did not acknowledge the exact source-linked book. Creation was rolled back.', 500, 'FIELD_CAPTURE_BOOK_ACKNOWLEDGEMENT')
    }
    await logAuditEvent({ userId: actorId, action: 'import', resourceType: 'fieldbooks', resourceId: input.bookId, timestamp: new Date(),
      details: { projectId: input.projectId, requestHash, sourceBatchIds: input.sources.map(source => source.batchId), authority: 'raw_capture_draft', fieldVerified: false } }, client)
    return { book: saved[0], replayed: false }
  })
}

export async function inspectBookCapture(_actorId: string, projectId: string, batchId: string) {
  return db.transaction(async client => { await requireRecordingProject(client, projectId); return (await verifiedSources(client, projectId, [{ batchId }]))[0] })
}

const cursorSchema = z.object({ id: z.string().guid(), at: z.string().datetime({ offset: true }).nullable() })
export async function listBookCaptures(_actorId: string, projectId: string, cursor?: string) {
  let after: z.infer<typeof cursorSchema> | null = null
  if (cursor) {
    try { after = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) }
    catch { throw new AppError('The source page cursor is invalid. Reload the first page.', 400, 'FIELD_CAPTURE_CURSOR') }
  }
  return db.transaction(async client => {
    await requireRecordingProject(client, projectId)
    const result = await client.query<{ id: string; created_at: Date | null; client_id: string; station: string; mode: string; captured_by: string | null }>(
      `SELECT id,created_at,quality_metadata#>>'{raw,id}' client_id,
       COALESCE(quality_metadata#>>'{raw,pointName}',quality_metadata#>>'{raw,station}') station,
       COALESCE(quality_metadata#>>'{raw,surveyMode}',quality_metadata#>>'{raw,surveyType}') mode,
       quality_metadata->>'capturedBy' captured_by
       FROM observation_batches WHERE project_id=$1 AND quality_metadata->>'kind'='offline_field_observation'
       AND ($4::boolean OR ($2::timestamptz IS NOT NULL AND (created_at>$2 OR (created_at=$2 AND id>$3) OR created_at IS NULL)) OR ($2::timestamptz IS NULL AND created_at IS NULL AND id>$3))
       ORDER BY created_at ASC NULLS LAST,id ASC LIMIT 51`, [projectId, after?.at ?? null, after?.id ?? null, !after])
    const rows = result.rows.slice(0, 50), last = rows.at(-1)
    return { items: rows.map(row => ({ batchId: row.id, clientId: row.client_id, station: row.station, mode: row.mode, capturedBy: row.captured_by, recordedAt: row.created_at?.toISOString() ?? null })),
      next: result.rows.length > 50 && last ? Buffer.from(JSON.stringify({ id: last.id, at: last.created_at?.toISOString() ?? null })).toString('base64url') : null }
  })
}
