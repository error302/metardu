/**
 * deliverableRegister — the document register (blueprint §15, §28).
 *
 * Every professional document METARDU issues must answer: what is it, which
 * data revision produced it, what is its content hash, who issued and reviewed
 * it, and which document it superseded. Without a register, re-issuing a plan
 * silently destroys the previous one — the difference between a record and an
 * unreproducible file.
 *
 * This module is the single place that writes `deliverables` /
 * `deliverable_revisions`. Export routes call `registerDeliverable` and
 * nothing else; revisions are append-only (enforced by trigger, migration 072).
 */

import { createHash } from 'crypto'
import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { recordEvidenceEvent, type EvidenceEventType } from '@/lib/observations/observationBatches'

/** Document types the register understands (blueprint §15.1–§15.5). */
export type DeliverableDocumentType =
  | 'deed_plan'
  | 'survey_plan'
  | 'coordinate_schedule'
  | 'beacon_schedule'
  | 'form_c22'
  | 'statutory_workbook'
  | 'report'
  | 'dxf'
  | 'landxml'
  | 'geojson'
  | 'csv'
  | 'submission_package'
  | 'other'

export type DeliverableStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'VOID'

export interface DeliverableRecord {
  id: string
  project_id: string
  document_type: DeliverableDocumentType
  title: string | null
  source_revision: string | null
  current_revision: number
  status: DeliverableStatus
  generated_by: string | null
  reviewed_by: string | null
  approved_at: string | null
  superseded_by: string | null
  created_at: string
  updated_at: string
}

export interface DeliverableRevision {
  id: string
  deliverable_id: string
  revision: number
  content_hash: string
  storage_path: string | null
  bytes: number | null
  source_revision: string | null
  generator: string | null
  generator_version: string | null
  project_crs: string | null
  manifest: Record<string, unknown>
  generated_by: string | null
  generated_at: string
}

/** SHA-256 of the issued artifact — the tamper evidence a client cannot forge. */
export function hashDeliverableContent(content: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export interface RegisterDeliverableInput {
  projectId: string
  documentType: DeliverableDocumentType
  /** The artifact itself, hashed server-side. */
  content: string | Buffer | Uint8Array
  title?: string | null
  /** Which data/design revision produced this document (blueprint §28). */
  sourceRevision?: string | null
  /** The CRS the document states, when known. */
  projectCrs?: string | null
  generator?: string | null
  generatorVersion?: string | null
  /** Input ids/parameters that produced the artifact. */
  manifest?: Record<string, unknown>
  /** Where the artifact is stored, when it is persisted to disk/object store. */
  storagePath?: string | null
  userId?: string | null
  /** Emit an evidence event; almost always true for professional outputs. */
  evidence?: { entityId?: string; eventType?: EvidenceEventType } | null
}

export interface RegisterDeliverableResult {
  deliverable: DeliverableRecord
  revision: DeliverableRevision
  /** The document this one supersedes, when a new revision replaced it. */
  supersededDeliverableId: string | null
}

/**
 * Register a generated document and its default export evidence atomically.
 *
 * Behaviour:
 *  - the current live deliverable of this (project, type) becomes a new
 *    REVISION of it when it exists, otherwise a fresh deliverable row;
 *  - a superseded deliverable (e.g. after a document type split) is linked,
 *    never deleted;
 *  - an `EXPORTED` evidence event is written so the timeline covers delivery.
 */
export async function registerDeliverable(
  input: RegisterDeliverableInput,
  /** Join an existing transaction when file metadata must commit with the register. */
  transactionClient?: PoolClient,
): Promise<RegisterDeliverableResult> {
  // Keep metadata consistent while waiting for the per-document stream lock.
  input = { ...input }
  const manifest = JSON.stringify(input.manifest ?? {})
  const contentHash = hashDeliverableContent(input.content)
  const byteLength =
    typeof input.content === 'string'
      ? Buffer.byteLength(input.content, 'utf8')
      : input.content.byteLength ?? input.content.length

  const append = async (client: PoolClient): Promise<RegisterDeliverableResult> => {
    // Serialize the first append too, when there is no current row to lock yet.
    const stream = `deliverables:${input.projectId.toLowerCase()}:${input.documentType}`
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [stream])
    const existing = await client.query<DeliverableRecord>(
      `SELECT * FROM deliverables
        WHERE project_id = $1 AND document_type = $2
          AND superseded_by IS NULL AND status <> 'VOID'
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.projectId, input.documentType]
    )
    const current = existing.rows[0]

    let deliverableId: string
    let revisionNumber: number
    let deliverable: DeliverableRecord
    const supersededDeliverableId: string | null = null

    if (current) {
      deliverableId = current.id
      revisionNumber = current.current_revision + 1
      const updated = await client.query<DeliverableRecord>(
        `UPDATE deliverables
            SET current_revision = $2, updated_at = NOW(), status = 'IN_REVIEW',
                source_revision = $3, title = $4, generated_by = $5,
                reviewed_by = NULL, approved_at = NULL
          WHERE id = $1 RETURNING *`,
        [deliverableId, revisionNumber, input.sourceRevision ?? null,
          input.title === undefined ? current.title : input.title, input.userId ?? null]
      )
      if (!updated.rows[0]) throw new Error('The deliverable register was not updated.')
      deliverable = updated.rows[0]
    } else {
      const created = await client.query<DeliverableRecord>(
        `INSERT INTO deliverables
           (project_id, document_type, title, source_revision, current_revision, status, generated_by)
         VALUES ($1, $2, $3, $4, 1, 'IN_REVIEW', $5)
         RETURNING *`,
        [
          input.projectId,
          input.documentType,
          input.title ?? null,
          input.sourceRevision ?? null,
          input.userId ?? null,
        ]
      )
      if (!created.rows[0]) throw new Error('The deliverable register was not created.')
      deliverable = created.rows[0]
      deliverableId = deliverable.id
      revisionNumber = 1
    }

    const revisionRow = await client.query<DeliverableRevision>(
      `INSERT INTO deliverable_revisions
         (deliverable_id, revision, content_hash, storage_path, bytes, source_revision,
          generator, generator_version, project_crs, manifest, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        deliverableId,
        revisionNumber,
        contentHash,
        input.storagePath ?? null,
        byteLength,
        input.sourceRevision ?? null,
        input.generator ?? null,
        input.generatorVersion ?? null,
        input.projectCrs ?? null,
        manifest,
        input.userId ?? null,
      ]
    )
    if (!revisionRow.rows[0]) throw new Error('The deliverable revision was not recorded.')

    if (input.evidence !== null) {
      const eventType = input.evidence?.eventType ?? 'EXPORTED'
      if (eventType === 'EXPORTED') {
        await recordEvidenceEvent({
          projectId: input.projectId,
          entityType: 'deliverable',
          entityId: deliverableId,
          eventType,
          userId: input.userId ?? undefined,
          details: {
            document_type: input.documentType,
            revision: revisionNumber,
            content_hash: contentHash,
            source_revision: input.sourceRevision ?? null,
            project_crs: input.projectCrs ?? null,
            generator: input.generator ?? null,
            bytes: byteLength,
          },
        }, client)
      }
    }

    return {
      deliverable,
      revision: revisionRow.rows[0],
      supersededDeliverableId,
    }
  }
  return transactionClient ? append(transactionClient) : db.transaction(append)
}

/** Mark a deliverable superseded by another (never deleted). */
export async function supersedeDeliverable(
  deliverableId: string,
  supersededBy: string,
): Promise<void> {
  await db.query(
    `UPDATE deliverables
        SET status = 'SUPERSEDED', superseded_by = $2, updated_at = NOW()
      WHERE id = $1`,
    [deliverableId, supersededBy]
  )
}

export interface ListDeliverablesOptions {
  projectId: string
  documentType?: DeliverableDocumentType
  includeSuperseded?: boolean
  limit?: number
}

/** The document register for a project, newest first. */
export async function listDeliverables(
  options: ListDeliverablesOptions,
): Promise<DeliverableRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const conditions = ['project_id = $1']
  const params: unknown[] = [options.projectId]

  if (options.documentType) {
    params.push(options.documentType)
    conditions.push(`document_type = $${params.length}`)
  }
  if (!options.includeSuperseded) {
    conditions.push(`superseded_by IS NULL AND status <> 'VOID'`)
  }
  params.push(limit)

  const result = await db.query<DeliverableRecord>(
    `SELECT * FROM deliverables
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  )
  return result.rows
}

/** Full revision history for one deliverable. */
export async function listDeliverableRevisions(
  deliverableId: string,
): Promise<DeliverableRevision[]> {
  const result = await db.query<DeliverableRevision>(
    `SELECT * FROM deliverable_revisions
      WHERE deliverable_id = $1
      ORDER BY revision DESC`,
    [deliverableId]
  )
  return result.rows
}
