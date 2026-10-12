/**
 * POST /api/workers/process
 *
 * Processes pending jobs from the background_jobs queue.
 * Designed to be called by an external cron (e.g. Vercel Cron, systemd timer)
 * or a dedicated worker process.
 *
 * Processes up to 5 jobs per invocation with proper error handling,
 * timeout management, and status updates.
 *
 * Security: requires the same API_ADMIN_KEY bearer credential as other cron
 * routes. A signed-in web user cannot trigger queue execution.
 */

export const dynamic = 'force-dynamic'

import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { isProcessableJobType, unsupportedJobTypeMessage } from '@/lib/jobs/jobRegistry'
import { NextResponse } from 'next/server'

// ─── Row interface ───────────────────────────────────────────────────────
interface JobRow {
  id: string
  job_type: string
  status: string
  payload: string | Record<string, unknown> | null
  attempts: number | null
  max_attempts: number | null
  priority: number | null
  created_at: Date | string
  started_at: Date | string | null
  completed_at: Date | string | null
  error_message: string | null
  result: unknown
}

const JOB_TIMEOUT_MS = 55_000 // stay within Vercel 60s limit

export const POST = apiHandler(
  { auth: false, rateLimit: { max: 10, windowMs: 60_000 } },
  async (req, ctx) => {
    const serviceKey = process.env.API_ADMIN_KEY
    if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (ctx.body ?? {}) as { limit?: number; jobId?: string }

    const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
      ? Math.max(1, Math.min(body.limit, 20))
      : 5

    // Atomic fetch + lock pending jobs per Blueprint §21.5 using FOR UPDATE SKIP LOCKED
    const fetchQuery = body.jobId
      ? `UPDATE background_jobs
         SET status = 'running', started_at = NOW()
         WHERE id = (
           SELECT id FROM background_jobs
           WHERE id = $1 AND status = 'pending'
             AND (COALESCE(attempts, 0) = 0
               OR updated_at <= NOW() - make_interval(secs => POWER(2, LEAST(attempts, 10))::integer))
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`
      : `WITH candidate_jobs AS (
           SELECT id FROM background_jobs
           WHERE status = 'pending'
             AND (COALESCE(attempts, 0) = 0
               OR updated_at <= NOW() - make_interval(secs => POWER(2, LEAST(attempts, 10))::integer))
           ORDER BY priority DESC, created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE background_jobs bj
         SET status = 'running', started_at = NOW()
         FROM candidate_jobs cj
         WHERE bj.id = cj.id
         RETURNING bj.*`

    const params = body.jobId ? [body.jobId] : [limit]
    const { rows: jobs } = await db.query<JobRow>(fetchQuery, params)

    const results: Array<{ jobId: string; status: string; error?: string; durationMs: number; retries?: number; nextRetryIn?: string }> = []

    for (const job of jobs) {
      const start = Date.now()

      try {

        if (!isProcessableJobType(job.job_type)) {
          throw new Error(unsupportedJobTypeMessage(job.job_type))
        }
        const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) as Record<string, unknown> : (job.payload || {})
        const result = await processJob(job.job_type, payload)

        const durationMs = Date.now() - start

        await db.query<never>(
          `UPDATE background_jobs
             SET status = 'completed',
                 result = $2,
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
          [job.id, JSON.stringify(result)]
        )

        results.push({ jobId: job.id, status: 'completed', durationMs })

      } catch (err: unknown) {
        const durationMs = Date.now() - start
        const message = err instanceof Error ? err.message : 'Unknown error'

        const unsupported = !isProcessableJobType(job.job_type)
        const attempts = unsupported ? (job.attempts || 0) : (job.attempts || 0) + 1
        const maxAttempts = Math.max(1, job.max_attempts || 3)

        if (unsupported || attempts >= maxAttempts) {
          // 'failed' is the terminal status allowed by the deployed schema.
          // Jobs without a handler are failed immediately and never retried.
          await db.query<never>(
            `UPDATE background_jobs
               SET status = 'failed',
                   error_message = $2,
                   completed_at = NOW(),
                   attempts = $3,
                   updated_at = NOW()
             WHERE id = $1`,
            [job.id, message.slice(0, 500), attempts]
          )
          results.push({ jobId: job.id, status: 'failed', error: message, durationMs, retries: attempts })
        } else {
          // The claim query enforces the backoff using attempts and updated_at.
          const delayMs = Math.pow(2, Math.min(attempts, 10)) * 1000
          await db.query<never>(
            `UPDATE background_jobs
               SET status = 'pending',
                   error_message = $2,
                   attempts = $3,
                   updated_at = NOW()
             WHERE id = $1`,
            [job.id, message.slice(0, 500), attempts]
          )
          results.push({ jobId: job.id, status: 'requeued', error: message, durationMs, retries: attempts, nextRetryIn: `${delayMs}ms` })
        }
      }
    }

    return apiSuccess({
      processed: results.length,
      jobs: results,
      timestamp: new Date().toISOString(),
    })
  },
)

/**
 * Process a single job based on its type.
 * Each handler receives the parsed payload and returns a result object.
 * Errors are caught by the outer try/catch and written to the job record.
 */
async function processJob(
  jobType: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const timeout = JOB_TIMEOUT_MS

  switch (jobType) {
    case 'pdf_generation': {
      const { generateDocument } = await import('@/lib/submission/assembleDocument')
      const docResult = await Promise.race([
        generateDocument({
          projectId: String(payload.project_id),
          documentId: String(payload.document_id),
          surveyType: String(payload.survey_type ?? 'cadastral'),
          userId: payload.userId ? String(payload.userId) : undefined,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Job timed out after ${timeout}ms`)), timeout)
        ),
      ])
      return { fileUrl: (docResult as { fileUrl: string }).fileUrl }
    }

    case 'dxf_generation': {
      const projectId = String(payload.project_id)
      const dxfType = String(payload.dxfType ?? 'form_no_4')
      const { generateFormNo4DXF } = await import('@/lib/submission/generators/formNo4')
      const { assembleSubmissionPackage } = await import('@/lib/submission/assembleSubmission')

      const submission = await Promise.race([
        assembleSubmissionPackage(projectId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`DXF: failed to assemble submission package`)), timeout)
        ),
      ])

      const dxfContent = await Promise.race([
        generateFormNo4DXF((submission as { zipBuffer: Buffer; ref: string; qa: unknown }).zipBuffer as unknown as Parameters<typeof generateFormNo4DXF>[0]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`DXF job timed out after ${timeout}ms`)), timeout)
        ),
      ])
      void dxfContent // DXF string generated; caller retrieves via document record
      return { type: dxfType, dxfLength: typeof dxfContent === 'string' ? dxfContent.length : 0, ref: (submission as { ref: string }).ref }
    }

    case 'assemble_submission': {
      const { assembleSubmissionPackage } = await import('@/lib/submission/assembleSubmission')
      const asmResult = await Promise.race([
        assembleSubmissionPackage(String(payload.project_id)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Assembly job timed out after ${timeout}ms`)), timeout)
        ),
      ])
      const asm = asmResult as { ref: string; qa: { passed: boolean } }
      return { ref: asm.ref, qaPassed: asm.qa.passed }
    }

    case 'traverse_compute': {
      const { computeTraverse } = await import('@/lib/computations/traverseEngine')
      const traverseResult = await Promise.race([
        computeTraverse(payload as Parameters<typeof computeTraverse>[0]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Traverse job timed out after ${timeout}ms`)), timeout)
        ),
      ])
      const tr = traverseResult as { coordinates: Array<unknown>; precisionRatio: number }
      return { pointCount: tr.coordinates.length, precisionRatio: tr.precisionRatio }
    }

    case 'earthworks_boq': {
      const { generateEarthworksBoQ } = await import('@/lib/print/earthworksBoQ')
      const inp = payload.input as Parameters<typeof generateEarthworksBoQ>[0]
      const boqResult = await Promise.race([
        generateEarthworksBoQ(inp),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Earthworks BoQ timed out after ${timeout}ms`)), timeout)
        ),
      ])
      return { htmlLength: String(boqResult).length }
    }

    default:
      throw new Error(`Unknown job type: ${jobType}`)
  }
}
