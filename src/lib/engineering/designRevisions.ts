/**
 * designRevisions — the design revision register (blueprint §28, §19, §14.3).
 *
 * Projects used to fake a revision with `updated_at::text`, which meant no
 * drawing, set-out schedule or export could name the design it came from, and
 * alignment edits (DELETE + re-insert) left no trail at all. This module is
 * the single writer: it atomically appends a revision, retires its predecessor, and
 * emits a `DERIVED` evidence event so the project's timeline shows the design
 * moving.
 *
 * Revision content and backward predecessor links are immutable. Migration 095
 * permits only retirement status changes and guards the numbered chain.
 */

import { db } from '@/lib/db'
import { recordEvidenceEvent } from '@/lib/observations/observationBatches'
import type { PoolClient } from 'pg'
import { canonicalJson } from '@/lib/provenance/canonicalJson'

export type DesignDiscipline =
  | 'general'
  | 'road'
  | 'cadastral'
  | 'topographic'
  | 'construction'
  | 'structural'

export type DesignRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'VOID'

export interface DesignRevisionInput {
  projectId: string
  discipline?: DesignDiscipline
  /** e.g. 'alignment', 'surface', 'parcel_grid' */
  entityType: string
  /** Specific entity (an alignment id, a grid name); null for project-wide. */
  entityId?: string | null
  /** Source data revision this design was derived from (e.g. 'R03'). */
  sourceRevision?: string | null
  summary?: string | null
  crs?: string | null
  /** The design as stored, so a revision can be reconstructed and diffed. */
  payload?: Record<string, unknown>
  userId?: string | null
  /** Default true. False is only valid when no current revision exists. */
  supersedeCurrent?: boolean
  /** Calculation snapshots remain drafts; recording is not a review submission. */
  draftOnly?: boolean
}

export interface DesignRevisionRecord {
  id: string
  project_id: string
  discipline: string
  entity_type: string
  entity_id: string | null
  revision: string
  revision_number: number
  status: DesignRevisionStatus
  supersedes_id: string | null
  source_revision: string | null
  content_hash: string | null
  crs: string | null
  created_at: string
}

/** Stable hash of a design payload, so two identical designs are detectable. */
export function hashDesignPayload(payload: Record<string, unknown>): string {
  const canonical = canonicalJson(payload);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Append a design revision and (optionally) supersede the current one.
 * Returns the new revision plus the revision it replaced. With a transaction
 * client, the caller owns commit/rollback and emits its timeline after commit.
 */
export async function recordDesignRevision(
  input: DesignRevisionInput,
  transactionClient?: PoolClient
): Promise<{ revision: DesignRevisionRecord; supersededId: string | null }> {
  const discipline = input.discipline ?? 'general';
  const entityId = input.entityId ?? null;
  const contentHash = hashDesignPayload(input.payload ?? {});

  const append = async (client: PoolClient) => {
    // Serialize even the first append, where there is no revision row to lock.
    // The insert trigger takes the same lock for callers outside this writer.
    const stream = `${input.projectId.toLowerCase()}:${discipline}:${input.entityType}:${entityId ?? ''}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [stream]);
    const { rows: current } = await client.query<{
      id: string
      revision_number: number
      revision: string
      status: DesignRevisionStatus
    }>(
      `SELECT id, revision_number, revision, status FROM design_revisions
      WHERE project_id = $1 AND discipline = $2 AND entity_type = $3
        AND COALESCE(entity_id, '') = COALESCE($4, '')
      ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
      [input.projectId, discipline, input.entityType, entityId]
    );

    const previous = current[0] ?? null;
    const revisionNumber = (previous?.revision_number ?? 0) + 1;
    const revisionLabel = `R${String(revisionNumber).padStart(2, '0')}`;
    const hasActivePredecessor = previous && !['VOID', 'SUPERSEDED'].includes(previous.status);
    if (hasActivePredecessor && input.supersedeCurrent === false) {
      throw new Error('A current design revision exists; a new revision must supersede it.');
    }
    if (hasActivePredecessor) {
      // Retire before inserting so the unique active-stream index stays valid.
      // Both changes commit together; an insert error restores the old status.
      await client.query(
        `UPDATE design_revisions
            SET status = 'SUPERSEDED'
          WHERE id = $1 AND status NOT IN ('SUPERSEDED', 'VOID')`,
        [previous.id]
      );
    }

    const { rows } = await client.query<DesignRevisionRecord>(
      `INSERT INTO design_revisions
         (project_id, discipline, entity_type, entity_id, revision, revision_number,
          status, supersedes_id, source_revision, summary, content_hash, crs, payload, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        input.projectId,
        discipline,
        input.entityType,
        entityId,
        revisionLabel,
        revisionNumber,
        previous && !input.draftOnly ? 'IN_REVIEW' : 'DRAFT',
        previous?.id ?? null,
        input.sourceRevision ?? null,
        input.summary ?? null,
        contentHash,
        input.crs ?? null,
        JSON.stringify(input.payload ?? {}),
        input.userId ?? null,
      ]
    );
    const created = rows[0];
    if (!created) throw new Error('Design revision was not recorded.');
    return { revision: created, supersededId: previous?.id ?? null, previousRevision: previous?.revision ?? null };
  };
  const result = transactionClient ? await append(transactionClient) : await db.transaction(append);
  const created = result.revision;

  if (!transactionClient) await recordEvidenceEvent({
    projectId: input.projectId,
    entityType: 'design_revision',
    entityId: created.id,
    eventType: 'DERIVED',
    userId: input.userId ?? undefined,
    details: {
      discipline,
      entity_type: input.entityType,
      entity_id: entityId,
      revision: created.revision,
      supersedes: result.previousRevision,
      source_revision: input.sourceRevision ?? null,
      content_hash: contentHash,
    },
  }).catch(() => {
    // The revision row is the record; the timeline is additive.
  });

  return { revision: created, supersededId: result.supersededId };
}

/** Every revision of one entity, newest first. */
export async function listDesignRevisions(
  projectId: string,
  entityType?: string,
  discipline?: DesignDiscipline
): Promise<DesignRevisionRecord[]> {
  const conditions = ['project_id = $1'];
  const params: unknown[] = [projectId];
  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (discipline) {
    params.push(discipline);
    conditions.push(`discipline = $${params.length}`);
  }
  const { rows } = await db.query<DesignRevisionRecord>(
    `SELECT * FROM design_revisions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC`,
    params
  );
  return rows;
}

/** The live revision for an entity — what an export must state. */
export async function currentDesignRevision(
  projectId: string,
  entityType: string,
  entityId?: string | null,
  discipline?: DesignDiscipline
): Promise<DesignRevisionRecord | null> {
  const { rows } = await db.query<DesignRevisionRecord>(
    `SELECT * FROM design_revisions
      WHERE project_id = $1 AND entity_type = $2 AND COALESCE(entity_id, '') = COALESCE($3, '')
        AND status NOT IN ('SUPERSEDED', 'VOID')
        AND ($4::text IS NULL OR discipline = $4)
      ORDER BY revision_number DESC LIMIT 2`,
    [projectId, entityType, entityId ?? null, discipline ?? null]
  );
  if (rows.length > 1) throw new Error('Specify the design discipline: the current revision lookup is ambiguous.');
  return rows[0] ?? null;
}
