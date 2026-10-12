/**
 * Canonical Background Jobs Registry & Worker Primitives
 *
 * Blueprint reference:
 *   §21.5 Background jobs (PostgreSQL pattern with FOR UPDATE SKIP LOCKED, progress, project ownership, retries, DLQ)
 *   §31 P0 Background jobs (Canonical TypeScript job registry, DB constraints match worker, no Python backend for core web workflows)
 */

import { db } from '@/lib/db'

// ─── Registered survey job types (including planned, unimplemented work) ───

export const SURVEY_JOB_TYPES = [
  'pdf_generation',
  'dxf_generation',
  'shapefile_generation',
  'report_processing',
  'payment_verification',
  'email_notification',
  'assemble_submission',
  'traverse_compute',
  'earthworks_boq',
  'large_import',
  'topology_full_project',
  'surface_build',
  'contour_generation',
  'bulk_plan_generation',
  'submission_assembly',
  'large_dxf',
  'large_landxml',
  'report_batch',
] as const

export type SurveyJobType = (typeof SURVEY_JOB_TYPES)[number]

// Keep queue admission aligned with /api/workers/process. Adding a planned
// type to SURVEY_JOB_TYPES does not make it safe to enqueue.
export const PROCESSABLE_JOB_TYPES = [
  'pdf_generation',
  'dxf_generation',
  'assemble_submission',
  'traverse_compute',
  'earthworks_boq',
] as const satisfies readonly SurveyJobType[]

export type ProcessableJobType = (typeof PROCESSABLE_JOB_TYPES)[number]

export function isProcessableJobType(jobType: string): jobType is ProcessableJobType {
  return PROCESSABLE_JOB_TYPES.some((supported) => supported === jobType)
}

export function unsupportedJobTypeMessage(jobType: string): string {
  const registered = SURVEY_JOB_TYPES.some((known) => known === jobType)
  return registered
    ? `Background job type "${jobType}" is registered but has no worker handler and cannot be enqueued.`
    : `Unknown background job type "${jobType}".`
}

export type JobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface BackgroundJob<TPayload = Record<string, unknown>, TResult = unknown> {
  id: string
  job_type: SurveyJobType
  project_id: string | null
  payload: TPayload
  status: JobStatus
  priority: number
  attempts: number
  max_attempts: number
  progress: number
  progress_message: string | null
  idempotency_key: string | null
  started_at: string | Date | null
  completed_at: string | Date | null
  error_message: string | null
  result: TResult | null
  created_by: string | null
  created_at: string | Date
  updated_at: string | Date
}

export interface EnqueueJobOptions<TPayload = Record<string, unknown>> {
  jobType: ProcessableJobType
  payload: TPayload
  projectId?: string
  priority?: number
  maxAttempts?: number
  idempotencyKey?: string
  userId?: string
}

/**
 * Enqueue a background job with idempotency and priority support.
 */
export async function enqueueJob<TPayload = Record<string, unknown>>(
  options: EnqueueJobOptions<TPayload>,
): Promise<{ id: string; status: JobStatus; enqueued: boolean }> {
  const {
    jobType,
    payload,
    projectId,
    priority = 5,
    maxAttempts = 3,
    idempotencyKey,
    userId,
  } = options

  if (!isProcessableJobType(jobType)) {
    throw new Error(unsupportedJobTypeMessage(String(jobType)))
  }

  // Idempotency check: if key provided and already exists, return existing job
  if (idempotencyKey) {
    const existing = await db.query<{ id: string; status: JobStatus }>(
      `SELECT id, status FROM background_jobs WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    )
    if (existing.rows.length > 0) {
      return {
        id: existing.rows[0].id,
        status: existing.rows[0].status,
        enqueued: false,
      }
    }
  }

  const result = await db.query<{ id: string; status: JobStatus }>(
    `INSERT INTO background_jobs (
      job_type,
      project_id,
      payload,
      priority,
      max_attempts,
      idempotency_key,
      created_by,
      status,
      progress
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0)
    RETURNING id, status`,
    [
      jobType,
      projectId || null,
      JSON.stringify(payload),
      priority,
      maxAttempts,
      idempotencyKey || null,
      userId || null,
    ],
  )

  return {
    id: result.rows[0].id,
    status: result.rows[0].status,
    enqueued: true,
  }
}

/**
 * Fetch and lock the next pending jobs using PostgreSQL `FOR UPDATE SKIP LOCKED`.
 * This prevents concurrent worker race conditions without distributed Redis locks.
 */
export async function claimNextPendingJobs(
  limit: number = 5,
): Promise<BackgroundJob[]> {
  const safeLimit = Math.max(1, Math.min(limit, 20))

  // Atomic fetch + transition to 'running' using CTE with SKIP LOCKED
  const query = `
    WITH candidate_jobs AS (
      SELECT id
      FROM background_jobs
      WHERE status = 'pending'
        AND (COALESCE(attempts, 0) = 0
          OR updated_at <= NOW() - make_interval(secs => POWER(2, LEAST(attempts, 10))::integer))
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE background_jobs bj
    SET status = 'running',
        started_at = NOW(),
        updated_at = NOW()
    FROM candidate_jobs cj
    WHERE bj.id = cj.id
    RETURNING bj.*
  `

  const { rows } = await db.query<BackgroundJob>(query, [safeLimit])
  return rows
}

/**
 * Report job progress from 0% to 100% with optional descriptive message.
 */
export async function updateJobProgress(
  jobId: string,
  progress: number,
  message?: string,
): Promise<void> {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)))
  await db.query(
    `UPDATE background_jobs
     SET progress = $2,
         progress_message = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, boundedProgress, message || null],
  )
}

/**
 * Mark job as successfully completed with structured result payload.
 */
export async function completeJob(
  jobId: string,
  result: unknown,
): Promise<void> {
  await db.query(
    `UPDATE background_jobs
     SET status = 'completed',
         progress = 100,
         result = $2,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, JSON.stringify(result ?? {})],
  )
}

/**
 * Record job failure. Automatically requeues with exponential backoff if
 * attempts < max_attempts, or transitions to 'failed' for administrator audit.
 */
export async function failOrRequeueJob(
  jobId: string,
  errorMessage: string,
  currentAttempts: number,
  maxAttempts: number = 3,
): Promise<{ status: JobStatus; nextRetryDelayMs?: number }> {
  const nextAttempt = currentAttempts + 1

  if (nextAttempt >= maxAttempts) {
    // The existing database status constraint permits 'failed' as the
    // terminal state; it does not permit the planned 'dead_letter' value.
    await db.query(
      `UPDATE background_jobs
       SET status = 'failed',
           error_message = $2,
           attempts = $3,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [jobId, errorMessage.slice(0, 1000), nextAttempt],
    )
    return { status: 'failed' }
  }

  // Exponential backoff: 2s, 4s, 8s, 16s...
  const delayMs = Math.pow(2, Math.min(nextAttempt, 10)) * 1000

  await db.query(
    `UPDATE background_jobs
     SET status = 'pending',
         error_message = $2,
         attempts = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, errorMessage.slice(0, 1000), nextAttempt],
  )

  return { status: 'pending', nextRetryDelayMs: delayMs }
}

/**
 * Retrieve status, progress, and result of a job.
 */
export async function getJobStatus(
  jobId: string,
  userId?: string,
): Promise<BackgroundJob | null> {
  const query = userId
    ? `SELECT * FROM background_jobs WHERE id = $1 AND (created_by = $2 OR created_by IS NULL) LIMIT 1`
    : `SELECT * FROM background_jobs WHERE id = $1 LIMIT 1`

  const params = userId ? [jobId, userId] : [jobId]
  const { rows } = await db.query<BackgroundJob>(query, params)
  return rows[0] || null
}
