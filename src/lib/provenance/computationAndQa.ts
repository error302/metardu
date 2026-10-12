/**
 * computationRuns + qaRuns — the provenance writers (blueprint §5.3, §2.5, §16).
 *
 * Two guarantees:
 *
 * 1. A computation is identifiable after the fact: which algorithm and
 *    version ran, over which input revision, with which parameters, and the
 *    hashes of what went in and what came out (§5.3).
 * 2. A QA PASS is evidence, not decoration: rule, measured value, threshold,
 *    unit, the data/design revision and the tolerance-profile revision that
 *    judged it are all persisted, so a PASS can be defended later (§2.5).
 *
 * Tolerance profiles are versioned data (blueprint §16). When a profile row
 * exists it is used and its revision travels with every result; the in-memory
 * defaults are only a fallback for projects with no profile configured.
 */

import { db } from '@/lib/db'
import { recordEvidenceEvent } from '@/lib/observations/observationBatches'
import { AuthorizationError } from '@/lib/api/errors'
import type { PoolClient, QueryResultRow } from 'pg'

function writerFor(client?: PoolClient): Pick<typeof db, 'query'> {
  return client ? { query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => client.query<T>(text, values) } : db
}

// ─── Computation runs (§5.3) ───────────────────────────────────────────────

export interface RecordComputationRunInput {
  projectId: string
  algorithmId: string
  algorithmVersion: string
  inputVersion?: string | null
  parameters?: Record<string, unknown>
  inputHash?: string | null
  outputHash?: string | null
  result?: Record<string, unknown>
  qaSummary?: Record<string, unknown>
  crs?: string | null
  userId?: string | null
  durationMs?: number | null
  /** Emit a COMPUTED evidence event (default true). */
  evidence?: boolean
}

export interface ComputationRun {
  id: string
  project_id: string
  algorithm_id: string
  algorithm_version: string
  input_version: string | null
  input_hash: string | null
  output_hash: string | null
  crs: string | null
  created_at: string
}

export async function recordComputationRun(
  input: RecordComputationRunInput,
  transactionClient?: PoolClient,
): Promise<ComputationRun> {
  const database = writerFor(transactionClient)
  const result = await database.query<ComputationRun>(
    `INSERT INTO computation_runs
       (project_id, algorithm_id, algorithm_version, input_version, parameters,
        input_hash, output_hash, result, qa_summary, crs, user_id, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, project_id, algorithm_id, algorithm_version, input_version,
               input_hash, output_hash, crs, created_at`,
    [
      input.projectId,
      input.algorithmId,
      input.algorithmVersion,
      input.inputVersion ?? null,
      JSON.stringify(input.parameters ?? {}),
      input.inputHash ?? null,
      input.outputHash ?? null,
      JSON.stringify(input.result ?? {}),
      JSON.stringify(input.qaSummary ?? {}),
      input.crs ?? null,
      input.userId ?? null,
      input.durationMs ?? null,
    ]
  )
  const run = result.rows[0]
  if (!run) throw new Error('Computation run was not recorded.')

  if (!transactionClient && input.evidence !== false) {
    await recordEvidenceEvent({
      projectId: input.projectId,
      entityType: 'computation_run',
      entityId: run.id,
      eventType: 'COMPUTED',
      userId: input.userId ?? undefined,
      details: {
        algorithm_id: input.algorithmId,
        algorithm_version: input.algorithmVersion,
        input_version: input.inputVersion ?? null,
        input_hash: input.inputHash ?? null,
        output_hash: input.outputHash ?? null,
        crs: input.crs ?? null,
      },
    }).catch(() => {
      // The run row is the record of truth; the timeline is additive.
    })
  }

  return run
}

// ─── QA runs and results (§2.5, §16) ──────────────────────────────────────

export type QaResultKind = 'PASS' | 'WARN' | 'FAIL' | 'INFO'

export interface QaResultInput {
  checkType: string
  result: QaResultKind
  measuredValue?: number | null
  thresholdValue?: number | null
  unit?: string | null
  message?: string | null
  details?: Record<string, unknown>
}

export interface RecordQaRunInput {
  projectId: string
  dataRevision?: string | null
  designRevision?: string | null
  observerBatchId?: string | null
  userId?: string | null
  trigger?: 'manual' | 'on_compute' | 'on_export' | 'on_import'
  results: QaResultInput[]
  /** Recheck and lock ownership when accepting user-reported checks. */
  requireOwner?: boolean
  /** Explicit null means these checks did not use a stored profile. */
  toleranceProfile?: { id: string; version: string } | null
  /** Emit a QA_CHECKED evidence event (default true). */
  evidence?: boolean
}

export interface QaRunSummary {
  runId: string
  toleranceProfileId: string | null
  toleranceProfileVersion: string | null
  pass: number
  warn: number
  fail: number
}

interface ToleranceProfileRow {
  id: string
  version: string
  rules: Record<string, unknown>
}

/**
 * Resolve the project's tolerance profile (blueprint §16). Returns null when no
 * profile is configured — results are then recorded with the profile revision
 * explicitly null, i.e. "judged without a versioned profile", rather than
 * pretending a default standard was applied.
 */
export async function resolveToleranceProfile(
  projectId: string,
  transactionClient?: PoolClient,
): Promise<ToleranceProfileRow | null> {
  const database = writerFor(transactionClient)
  const projectProfile = database.query<ToleranceProfileRow>(
    `SELECT tp.id, tp.version, tp.rules
       FROM tolerance_profiles tp
       JOIN project_tolerance_profiles ptp ON ptp.tolerance_profile_id = tp.id
      WHERE ptp.project_id = $1
      LIMIT 1`,
    [projectId]
  );
  const { rows } = transactionClient ? await projectProfile : await projectProfile.catch(() => ({ rows: [] as ToleranceProfileRow[] }));
  if (rows.length > 0) return rows[0];

  const defaultProfile = database.query<ToleranceProfileRow>(
    `SELECT id, version, rules
       FROM tolerance_profiles
      WHERE is_default = TRUE
      ORDER BY created_at DESC
      LIMIT 1`
  );
  const fallback = transactionClient ? await defaultProfile : await defaultProfile.catch(() => ({ rows: [] as ToleranceProfileRow[] }));
  return fallback.rows[0] ?? null;
}

/** Persist a QA run with one result row per check (§2.5). */
export async function recordQaRun(input: RecordQaRunInput, transactionClient?: PoolClient): Promise<QaRunSummary> {
  if (input.results.length === 0 || input.results.length > 200) throw new Error('A QA run needs between 1 and 200 results.');
  if (!transactionClient) {
    const summary = await db.transaction(client => recordQaRun({ ...input, evidence: false }, client));
    if (input.evidence !== false) await recordEvidenceEvent({
      projectId: input.projectId, entityType: 'qa_run', entityId: summary.runId,
      eventType: 'QA_CHECKED', userId: input.userId ?? undefined,
      details: { pass: summary.pass, warn: summary.warn, fail: summary.fail,
        checks: input.results.length, data_revision: input.dataRevision ?? null,
        design_revision: input.designRevision ?? null,
        tolerance_profile_version: summary.toleranceProfileVersion, trigger: input.trigger ?? 'manual' },
    }).catch(() => { /* The committed run remains the record; the timeline is additive. */ });
    return summary;
  }
  const database = writerFor(transactionClient)
  if (input.requireOwner) {
    const project = await database.query<{ user_id: string | null }>(
      'SELECT user_id FROM projects WHERE id = $1 FOR SHARE', [input.projectId],
    );
    if (!input.userId || project.rows[0]?.user_id !== input.userId) {
      throw new AuthorizationError('QA recording requires a claimed project owner');
    }
  }
  const profile = input.toleranceProfile === undefined
    ? await resolveToleranceProfile(input.projectId, transactionClient)
    : input.toleranceProfile

  const runRow = await database.query<{ id: string }>(
    `INSERT INTO qa_runs
       (project_id, data_revision, design_revision, tolerance_profile_id,
        tolerance_profile_version, observer_batch_id, triggered_by, trigger, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING id`,
    [
      input.projectId,
      input.dataRevision ?? null,
      input.designRevision ?? null,
      profile?.id ?? null,
      profile?.version ?? null,
      input.observerBatchId ?? null,
      input.userId ?? null,
      input.trigger ?? 'manual',
    ]
  )
  const runId = runRow.rows[0]?.id
  if (!runId) throw new Error('QA run was not recorded.')

  for (const item of input.results) {
    await database.query(
      `INSERT INTO qa_results
         (qa_run_id, check_type, result, measured_value, threshold_value, unit, message, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        runId,
        item.checkType,
        item.result,
        item.measuredValue ?? null,
        item.thresholdValue ?? null,
        item.unit ?? null,
        item.message ?? null,
        JSON.stringify(item.details ?? {}),
      ]
    )
  }

  const counts = input.results.reduce(
    (acc, item) => {
      if (item.result === 'PASS') acc.pass += 1;
      else if (item.result === 'WARN') acc.warn += 1;
      else if (item.result === 'FAIL') acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  )

  await database.query(
    `UPDATE qa_runs SET summary = $2 WHERE id = $1`,
    [runId, JSON.stringify({ ...counts, checks: input.results.length })]
  )

  return {
    runId,
    toleranceProfileId: profile?.id ?? null,
    toleranceProfileVersion: profile?.version ?? null,
    ...counts,
  }
}

export interface QaResultRow {
  id: string
  qa_run_id: string
  check_type: string
  result: QaResultKind
  measured_value: number | string | null
  threshold_value: number | string | null
  unit: string | null
  message: string | null
  created_at: string
  details: Record<string, unknown>
}

/** The QA evidence for a project, newest run first — the Verify stage reads this. */
export async function listQaRuns(
  projectId: string,
  limit = 10,
): Promise<Array<QaRunSummary & { started_at: string; data_revision: string | null; design_revision: string | null; trigger: string; results: QaResultRow[] }>> {
  const runs = await db.query<{
    id: string
    tolerance_profile_id: string | null
    tolerance_profile_version: string | null
    started_at: string
    data_revision: string | null
    design_revision: string | null
    trigger: string
    summary: { pass?: number; warn?: number; fail?: number; checks?: number }
  }>(
    `SELECT id, tolerance_profile_id, tolerance_profile_version, started_at, data_revision, design_revision, trigger, summary
       FROM qa_runs WHERE project_id = $1
      ORDER BY started_at DESC LIMIT $2`,
    [projectId, Math.min(Math.max(limit, 1), 50)]
  )

  const out: Array<QaRunSummary & { started_at: string; data_revision: string | null; design_revision: string | null; trigger: string; results: QaResultRow[] }> = [];
  for (const run of runs.rows) {
    const results = await db.query<QaResultRow>(
      'SELECT * FROM qa_results WHERE qa_run_id = $1 ORDER BY created_at ASC',
      [run.id]
    );
    out.push({
      runId: run.id,
      toleranceProfileId: run.tolerance_profile_id,
      toleranceProfileVersion: run.tolerance_profile_version,
      pass: run.summary?.pass ?? 0,
      warn: run.summary?.warn ?? 0,
      fail: run.summary?.fail ?? 0,
      started_at: run.started_at,
      data_revision: run.data_revision, design_revision: run.design_revision, trigger: run.trigger,
      results: results.rows,
    });
  }
  return out;
}
