/**
 * Observation Batches & Evidence Events Service
 *
 * Blueprint reference:
 *   §2.3 Raw observations are immutable — batches preserve raw evidence
 *   §5.2 Observe — observation batches, source file hashes, operator, instrument metadata
 *   §6.4 Observation batches (traceability, rollback, instrument link)
 *   §14.2 Provenance (observation -> batch -> instrument -> computation -> plan)
 *   §14.3 Evidence events (append-only timeline: OBSERVED, IMPORTED, DERIVED, COMPUTED, ADJUSTED, QA_CHECKED, APPROVED, EXPORTED, SUPERSEDED)
 *   §19 Observation & Evidence schema
 *   §31 P0 Provenance
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ObservationSourceType =
  | 'total_station'
  | 'gnss_rtk'
  | 'gnss_static'
  | 'digital_level'
  | 'auto_level'
  | 'manual'
  | 'import'
  | 'uav_gcp'
  | 'as_built'

export type BatchStatus =
  | 'raw'
  | 'processed'
  | 'adjusted'
  | 'superseded'
  | 'quarantined'
  | 'RECORDED' // Historical status is retained without inferring processing.

export interface ObservationBatch {
  id: string
  project_id: string
  batch_number: string
  source_type: ObservationSourceType
  source_file_name: string | null
  source_file_hash: string | null
  source_file_size: number | null
  operator: string | null
  crew: string | null
  instrument_id: string | null
  instrument_name: string | null
  instrument_serial: string | null
  station: string | null
  backsight: string | null
  instrument_height: number | null
  target_height: number | null
  prism_constant: number | null
  source_crs: string | null
  quality_metadata: Record<string, unknown>
  point_count: number | null
  observation_count: number | null
  notes: string | null
  status: BatchStatus
  created_by: string | null
  created_at: string | Date
  updated_at: string | Date
}

export type EvidenceEventType =
  | 'OBSERVED'
  | 'IMPORTED'
  | 'DERIVED'
  | 'COMPUTED'
  | 'ADJUSTED'
  | 'QA_CHECKED'
  | 'APPROVED'
  | 'EXPORTED'
  | 'SUPERSEDED'

export interface EvidenceEvent {
  id: string
  project_id: string
  entity_type: string
  entity_id: string
  event_type: EvidenceEventType
  details: Record<string, unknown>
  user_id: string | null
  event_hash: string
  previous_hash: string | null
  created_at: string | Date
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of file data or raw content.
 */
export function computeSha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex')
}

// ─── Observation Batches CRUD ──────────────────────────────────────────────

// Read recorded legacy names without backfilling rows (which could also fire
// historical updated_at triggers). New coordinate captures never need the
// legacy fallback, so their potentially large source JSON is not expanded.
const compatibleBatchMetadata = ['source_file_name', 'operator', 'instrument_name']
  .map((column, index) => {
    const legacy = ['source_file', 'operator_name', 'instrument'][index]
    return `COALESCE(${column}, CASE WHEN quality_metadata->>'kind' IS DISTINCT FROM 'coordinate_import'
      THEN to_jsonb(observation_batches)->>'${legacy}' END) AS ${column}`
  }).join(', ')

export interface CreateBatchInput {
  projectId: string
  batchNumber: string
  sourceType: ObservationSourceType
  sourceFileName?: string
  sourceFileContent?: Buffer | string
  operator?: string
  crew?: string
  instrumentId?: string
  instrumentName?: string
  instrumentSerial?: string
  station?: string
  backsight?: string
  instrumentHeight?: number
  targetHeight?: number
  prismConstant?: number
  sourceCrs?: string
  qualityMetadata?: Record<string, unknown>
  pointCount?: number
  observationCount?: number
  notes?: string
  userId?: string
}

/**
 * Create a new immutable observation batch.
 */
export async function createObservationBatch(
  input: CreateBatchInput,
): Promise<ObservationBatch> {
  let fileHash: string | null = null
  let fileSize: number | null = null

  // An explicitly supplied zero-byte file still has a valid SHA-256 digest.
  if (input.sourceFileContent !== undefined) {
    fileHash = computeSha256(input.sourceFileContent)
    fileSize = Buffer.isBuffer(input.sourceFileContent)
      ? input.sourceFileContent.length
      : Buffer.byteLength(input.sourceFileContent, 'utf8')
  }

  const query = `
    INSERT INTO observation_batches (
      project_id,
      batch_number,
      source_type,
      source_file_name,
      source_file_hash,
      source_file_size,
      operator,
      crew,
      instrument_id,
      instrument_name,
      instrument_serial,
      station,
      backsight,
      instrument_height,
      target_height,
      prism_constant,
      source_crs,
      quality_metadata,
      point_count,
      observation_count,
      notes,
      created_by,
      status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, 'raw'
    )
    RETURNING *
  `

  const params = [
    input.projectId,
    input.batchNumber,
    input.sourceType,
    input.sourceFileName || null,
    fileHash,
    fileSize,
    input.operator || null,
    input.crew || null,
    input.instrumentId || null,
    input.instrumentName || null,
    input.instrumentSerial || null,
    input.station || null,
    input.backsight || null,
    input.instrumentHeight ?? null,
    input.targetHeight ?? null,
    input.prismConstant ?? null,
    input.sourceCrs || null,
    JSON.stringify(input.qualityMetadata || {}),
    input.pointCount ?? null,
    input.observationCount ?? null,
    input.notes || null,
    input.userId || null,
  ]

  const { rows } = await db.query<ObservationBatch>(query, params)
  const batch = rows[0]

  // Automatically record evidence event for the new observation batch
  await recordEvidenceEvent({
    projectId: input.projectId,
    entityType: 'observation_batch',
    entityId: batch.id,
    eventType: input.sourceType === 'import' ? 'IMPORTED' : 'OBSERVED',
    details: {
      batch_number: batch.batch_number,
      source_type: batch.source_type,
      file_hash: fileHash,
      point_count: batch.point_count,
      instrument: batch.instrument_name,
    },
    userId: input.userId,
  })

  return batch
}

/**
 * List all observation batches for a project, newest first.
 */
export async function listObservationBatches(
  projectId: string,
): Promise<ObservationBatch[]> {
  const { rows } = await db.query<ObservationBatch>(
    `SELECT id,project_id,batch_number,source_type,${compatibleBatchMetadata},source_file_hash,source_file_size,
       crew,instrument_id,instrument_serial,station,backsight,instrument_height,
       target_height,prism_constant,source_crs,point_count,observation_count,notes,status,created_by,created_at,updated_at,
       CASE WHEN quality_metadata->>'kind'='coordinate_import'
         THEN (quality_metadata - 'sourceText' - 'points' - 'pointIds' - 'selectedIndices' - 'warnings')
           || jsonb_build_object('summaryOnly',true,'warningCount',jsonb_array_length(COALESCE(quality_metadata->'warnings','[]'::jsonb)))
         ELSE quality_metadata END AS quality_metadata
     FROM observation_batches
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId],
  )
  return rows
}

/**
 * Fetch a single observation batch by ID.
 */
export async function getObservationBatch(
  batchId: string,
  projectId: string,
): Promise<ObservationBatch | null> {
  const { rows } = await db.query<ObservationBatch>(
    `SELECT *, ${compatibleBatchMetadata} FROM observation_batches
     WHERE id = $1 AND project_id = $2
     LIMIT 1`,
    [batchId, projectId],
  )
  return rows[0] || null
}

/**
 * Update an observation batch status (e.g. mark superseded or quarantined).
 * Raw observation records are never mutated; only the derivation state updates.
 */
export async function updateBatchStatus(
  batchId: string,
  projectId: string,
  newStatus: BatchStatus,
  userId?: string,
  reason?: string,
): Promise<ObservationBatch | null> {
  const { rows } = await db.query<ObservationBatch>(
    `UPDATE observation_batches
     SET status = $3,
         updated_at = NOW()
     WHERE id = $1 AND project_id = $2
     RETURNING *`,
    [batchId, projectId, newStatus],
  )

  if (rows.length > 0) {
    await recordEvidenceEvent({
      projectId,
      entityType: 'observation_batch',
      entityId: batchId,
      eventType: newStatus === 'superseded' ? 'SUPERSEDED' : 'ADJUSTED',
      details: {
        new_status: newStatus,
        reason: reason || null,
      },
      userId,
    })
  }

  return rows[0] || null
}

// ─── Evidence Events Hash Chain ───────────────────────────────────────────

export interface RecordEvidenceInput {
  projectId: string
  entityType: string
  entityId: string
  eventType: EvidenceEventType
  details: Record<string, unknown>
  userId?: string
}

/**
 * Append an immutable event to the cryptographic evidence hash chain.
 * Inspired by the Estonia e-Land ledger pattern.
 */
export async function recordEvidenceEvent(
  input: RecordEvidenceInput,
): Promise<EvidenceEvent> {
  // 1. Get the hash of the latest event in this project's chain
  const latestQuery = `
    SELECT event_hash
    FROM evidence_events
    WHERE project_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
  const latestResult = await db.query<{ event_hash: string }>(latestQuery, [
    input.projectId,
  ])
  const previousHash = latestResult.rows[0]?.event_hash || 'GENESIS'

  // 2. Compute canonical SHA-256 for the new event
  const canonicalPayload = JSON.stringify({
    project_id: input.projectId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    event_type: input.eventType,
    details: input.details,
    previous_hash: previousHash,
    user_id: input.userId || null,
  })

  const eventHash = computeSha256(canonicalPayload)

  // 3. Insert append-only evidence record
  const insertQuery = `
    INSERT INTO evidence_events (
      project_id,
      entity_type,
      entity_id,
      event_type,
      details,
      user_id,
      event_hash,
      previous_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `

  const { rows } = await db.query<EvidenceEvent>(insertQuery, [
    input.projectId,
    input.entityType,
    input.entityId,
    input.eventType,
    JSON.stringify(input.details),
    input.userId || null,
    eventHash,
    previousHash,
  ])

  return rows[0]
}

/**
 * Fetch the complete chronological evidence audit timeline for a project.
 */
export async function getEvidenceTimeline(
  projectId: string,
  limit: number = 100,
): Promise<EvidenceEvent[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500))
  const { rows } = await db.query<EvidenceEvent>(
    `SELECT * FROM evidence_events
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, safeLimit],
  )
  return rows
}
