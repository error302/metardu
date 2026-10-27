export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { createPipelineCapture, assertPipelineCapture, SavePipelineCaptureSchema, type SavedPipelineBatch, type PipelineHistorySummary } from '@/lib/engineering/pipelineCapture'

const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function owned(projectId: string, userId: string) {
  if (!z.string().guid().safeParse(projectId).success) return privateJson({ error: 'Invalid project ID.' }, 400)
  const access = await requireProjectOwnership(projectId, userId)
  if (!access.ok) {
    const response = access.error ?? privateJson({ error: 'Project ownership required.' }, 403)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  return null
}
function schemaFailure(error: unknown): NextResponse | null {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  return code === '42P01' || code === '42703'
    ? privateJson({ code: 'PIPELINE_HISTORY_SCHEMA_NOT_READY', error: 'Project pipeline history is not available yet. Keep or export this draft and retry after the database upgrade.' }, 503) : null
}
async function delivery(projectId: string, userId: string, clientBatchId: string) {
  const { rows } = await db.query<SavedPipelineBatch>(`SELECT * FROM pipeline_asbuilt_batches WHERE project_id = $1 AND actor_id = $2 AND client_batch_id = $3 LIMIT 1`, [projectId, userId, clientBatchId])
  return rows[0]
}
export const POST = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 } }, async (_request, ctx) => {
  const projectId = ctx.params.id
  const denied = await owned(projectId, ctx.userId)
  if (denied) return denied
  const parsed = SavePipelineCaptureSchema.safeParse(ctx.body)
  if (!parsed.success) return privateJson({ error: 'Supply measured CSV, reference metadata, optional complete cover criterion and a batch retry ID. Client results are not accepted.' }, 400)
  const { clientBatchId, ...input } = parsed.data
  let computed: ReturnType<typeof createPipelineCapture>
  try { computed = createPipelineCapture(input) }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : 'Invalid measured profile.' }, 400) }
  const replay = (saved: SavedPipelineBatch) => {
    try { assertPipelineCapture(saved.capture, saved.input_hash) }
    catch (error) { return privateJson({ code: 'SAVED_PIPELINE_CAPTURE_INVALID', error: error instanceof Error ? error.message : 'Retained capture cannot be verified; it was left unchanged.' }, 409) }
    return saved.input_hash === computed.inputHash
      ? privateJson({ data: saved, replayed: true })
      : privateJson({ code: 'BATCH_RETRY_CONFLICT', error: 'This batch ID already belongs to different input. The original observations were retained; use a new batch for revisions.' }, 409)
  }
  try {
    const existing = await delivery(projectId, ctx.userId, clientBatchId)
    if (existing) return replay(existing)
    // Capture the project name/reference in the same statement as the append.
    // No engineering_data replacement, invented field time or datum matching.
    const { rows } = await db.query<SavedPipelineBatch>(
      `INSERT INTO pipeline_asbuilt_batches (project_id, actor_id, client_batch_id, input_hash, capture, project_name, reference_snapshot)
       SELECT p.id, $2, $3, $4, $5::jsonb, p.name, to_jsonb(r)
       FROM projects p LEFT JOIN project_reference_systems r ON r.project_id = p.id
       WHERE p.id = $1 AND p.user_id = $2
       ON CONFLICT (project_id, actor_id, client_batch_id) DO NOTHING RETURNING *`,
      [projectId, ctx.userId, clientBatchId, computed.inputHash, JSON.stringify(computed.capture)],
    )
    if (rows[0]) return privateJson({ data: rows[0], replayed: false }, 201)
    const concurrent = await delivery(projectId, ctx.userId, clientBatchId)
    return concurrent ? replay(concurrent) : privateJson({ error: 'The observations were not saved. Check project ownership and retain this draft.' }, 409)
  } catch (error) { const response = schemaFailure(error); if (response) return response; throw error }
})
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const projectId = ctx.params.id
  const denied = await owned(projectId, ctx.userId)
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const batchId = params.get('batchId'), beforeId = params.get('beforeId')
  if ((batchId && beforeId) || [batchId, beforeId].some(id => id !== null && !z.string().guid().safeParse(id).success)) return privateJson({ error: 'Invalid batch ID or history cursor.' }, 400)
  try {
    if (batchId) {
      const { rows } = await db.query<SavedPipelineBatch>('SELECT * FROM pipeline_asbuilt_batches WHERE project_id = $1 AND id = $2 LIMIT 1', [projectId, batchId])
      if (!rows[0]) return privateJson({ error: 'Saved pipeline batch not found.' }, 404)
      try { assertPipelineCapture(rows[0].capture, rows[0].input_hash) }
      catch (error) { return privateJson({ code: 'SAVED_PIPELINE_CAPTURE_INVALID', error: error instanceof Error ? error.message : 'Retained capture cannot be verified; it was left unchanged.' }, 409) }
      return privateJson({ data: rows[0] })
    }
    const { rows } = await db.query<PipelineHistorySummary>(
      `SELECT id, recorded_at, capture->'metadata'->>'route' AS route,
         jsonb_array_length(capture->'result'->'points') AS point_count,
         capture->'result'->>'algorithmVersion' AS algorithm_version
       FROM pipeline_asbuilt_batches WHERE project_id = $1
       AND ($2::uuid IS NULL OR (recorded_at, id) <
         (SELECT recorded_at, id FROM pipeline_asbuilt_batches WHERE project_id = $1 AND id = $2))
       ORDER BY recorded_at DESC, id DESC LIMIT 51`, [projectId, beforeId],
    )
    const data = rows.slice(0, 50)
    return privateJson({ data, nextCursor: rows.length > 50 ? data[49].id : null })
  } catch (error) { const response = schemaFailure(error); if (response) return response; throw error }
})
