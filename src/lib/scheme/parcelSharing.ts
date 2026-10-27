import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { readRetainedSchemeExport } from './exportCommands'
import { publicSnapshotFromExport } from './parcelShareSnapshot'
import { hashSchemeValue } from './exportArtifact'
import {
  ensureSchemeExportStorage,
  readSchemeExportJournal,
} from './exportJournal'
import {
  parcelShareCommandSchema,
  parcelShareReceiptSchema,
  parcelShareListSchema,
  parcelShareSnapshotSchema,
  publicParcelShareSchema,
  type ParcelShareCommand,
} from './parcelShareContract'
const uuid = z.string().guid()
const fail = (message: string, status = 409) =>
  new AppError(message, status, 'PARCEL_SHARING')
export const parcelShareKeyHash = (key: string) =>
  createHash('sha256').update(key, 'utf8').digest('hex')
const receiptColumns = `id,project_id AS "projectId",actor_id AS "viewerId",export_request_id AS "exportRequestId",snapshot_hash AS "snapshotHash",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "expiresAt",CASE WHEN revoked_at IS NOT NULL THEN to_char(revoked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS "revokedAt"`
async function access(client: PoolClient, actor: string, project: string) {
  if (![actor, project].every((value) => uuid.safeParse(value).success))
    throw fail('Valid project and account IDs are required.', 400)
  const owner = await client.query<{ id: string }>(
    'SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR UPDATE',
    [project, actor],
  )
  if (owner.rows.length !== 1)
    throw fail('Project not found for this account.', 404)
  const ready = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('parcel_draft_shares') IS NOT NULL ready",
  )
  if (ready.rows[0]?.ready !== true)
    throw fail('Reviewed parcel sharing storage is unavailable.')
}
async function preview(
  client: PoolClient,
  actor: string,
  project: string,
  exportRequest: string,
) {
  if (!uuid.safeParse(exportRequest).success)
    throw fail('Choose a retained geographic export.', 400)
  await ensureSchemeExportStorage(client)
  const journal = await readSchemeExportJournal(
    actor,
    project,
    exportRequest,
    'geojson',
    client,
  )
  const packet = await readRetainedSchemeExport(
    actor,
    project,
    exportRequest,
    'geojson',
    client,
  )
  if (!packet)
    throw fail(
      'A retained geographic export for this account and project is required.',
      404,
    )
  const { bytes: _bytes, replayed: _replayed, ...metadata } = packet
  if (
    !journal ||
    journal.outcome !== 'committed' ||
    journal.deliverable_revision_id !== packet.revisionId ||
    hashSchemeValue(journal.receipt) !==
      hashSchemeValue({ outcome: 'committed', ...metadata })
  )
    throw fail('The retained draft and its committed export receipt disagree.')
  const snapshot = publicSnapshotFromExport(packet)
  return {
    projectId: project,
    viewerId: actor,
    exportRequestId: exportRequest,
    snapshotHash: hashSchemeValue(snapshot),
    snapshot,
    revisionId: packet.revisionId,
  }
}
export async function previewParcelShare(
  actor: string,
  project: string,
  exportRequest: string,
) {
  return db.transaction(async (client) => {
    await access(client, actor, project)
    const { revisionId: _private, ...data } = await preview(
      client,
      actor,
      project,
      exportRequest,
    )
    return data
  })
}
const commandHash = (body: ParcelShareCommand) =>
  hashSchemeValue({ ...body, key: parcelShareKeyHash(body.key) })
export async function createParcelShare(
  actor: string,
  project: string,
  input: unknown,
) {
  const result = parcelShareCommandSchema.safeParse(input)
  if (!result.success)
    throw fail(
      'Review the exact draft and sharing authority before creating a link.',
      400,
    )
  const body = result.data
  if (body.expectedUserId !== actor || body.projectId !== project)
    throw fail('Sign in as the account that reviewed this sharing intent.', 403)
  return db.transaction(async (client) => {
    await access(client, actor, project)
    const old = await client.query<{ command_hash: string; receipt: unknown }>(
      `SELECT command_hash,jsonb_build_object('id',id,'projectId',project_id,'viewerId',actor_id,'exportRequestId',export_request_id,'snapshotHash',snapshot_hash,'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expiresAt',to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'revokedAt',CASE WHEN revoked_at IS NOT NULL THEN to_char(revoked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END) receipt FROM parcel_draft_shares WHERE id=$1 AND project_id=$2 AND actor_id=$3 FOR UPDATE`,
      [body.requestId, project, actor],
    )
    if (old.rows.length) {
      if (old.rows[0].command_hash !== commandHash(body))
        throw fail(
          'This link request already belongs to a different sharing intent.',
        )
      return parcelShareReceiptSchema.parse(old.rows[0].receipt)
    }
    const data = await preview(client, actor, project, body.exportRequestId)
    if (data.snapshotHash !== body.snapshotHash)
      throw fail(
        'The shared draft differs from the reviewed preview. Review it again.',
      )
    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO parcel_draft_shares(id,project_id,actor_id,export_request_id,revision_id,token_hash,command_hash,snapshot_hash,snapshot,duration_days,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::integer,transaction_timestamp()+$10::integer*INTERVAL '24 hours') RETURNING ${receiptColumns},revision_id,token_hash,command_hash,snapshot,duration_days`,
      [
        body.requestId,
        project,
        actor,
        body.exportRequestId,
        data.revisionId,
        parcelShareKeyHash(body.key),
        commandHash(body),
        data.snapshotHash,
        canonicalJSON(data.snapshot),
        body.durationDays,
      ],
    )
    const {
      revision_id: revisionId,
      token_hash: tokenHash,
      command_hash: intentHash,
      snapshot: retainedSnapshot,
      duration_days: durationDays,
      ...receipt
    } = inserted.rows[0] ?? {}
    const saved = parcelShareReceiptSchema.safeParse(receipt)
    if (
      inserted.rowCount !== 1 ||
      inserted.rows.length !== 1 ||
      !saved.success ||
      saved.data.id !== body.requestId ||
      saved.data.projectId !== project ||
      saved.data.viewerId !== actor ||
      saved.data.exportRequestId !== body.exportRequestId ||
      saved.data.snapshotHash !== body.snapshotHash ||
      saved.data.revokedAt !== null ||
      Date.parse(saved.data.expiresAt) - Date.parse(saved.data.createdAt) !==
        body.durationDays * 86400000 ||
      revisionId !== data.revisionId ||
      tokenHash !== parcelShareKeyHash(body.key) ||
      intentHash !== commandHash(body) ||
      durationDays !== body.durationDays ||
      retainedSnapshot !== canonicalJSON(data.snapshot)
    )
      throw fail('The sharing register did not acknowledge the exact intent.')
    return saved.data
  })
}
export async function listParcelShares(
  actor: string,
  project: string,
  page: number,
) {
  if (!Number.isInteger(page) || page < 1 || page > 999999)
    throw fail('Choose a valid sharing history page.', 400)
  return db.transaction(async (client) => {
    await access(client, actor, project)
    const rows = await client.query(
      `SELECT ${receiptColumns} FROM parcel_draft_shares WHERE project_id=$1 AND actor_id=$2 ORDER BY created_at DESC,id DESC LIMIT 24 OFFSET ($3::integer-1)*24`,
      [project, actor, page],
    )
    const count = await client.query<{ total: string }>(
      'SELECT COUNT(*) total FROM parcel_draft_shares WHERE project_id=$1 AND actor_id=$2',
      [project, actor],
    )
    return parcelShareListSchema.parse({
      projectId: project,
      viewerId: actor,
      page,
      total: Number(count.rows[0]?.total),
      rows: rows.rows,
    })
  })
}
export async function revokeParcelShare(
  actor: string,
  project: string,
  shareId: string,
) {
  if (!uuid.safeParse(shareId).success)
    throw fail('Choose a valid sharing record.', 400)
  return db.transaction(async (client) => {
    await access(client, actor, project)
    const found = await client.query(
      `SELECT ${receiptColumns} FROM parcel_draft_shares WHERE id=$1 AND project_id=$2 AND actor_id=$3 FOR UPDATE`,
      [shareId, project, actor],
    )
    if (found.rows.length !== 1)
      throw fail('Sharing record not found for this account.', 404)
    const original = parcelShareReceiptSchema.parse(found.rows[0])
    if (original.revokedAt !== null) return original
    const saved = await client.query(
      `UPDATE parcel_draft_shares SET revoked_at=transaction_timestamp() WHERE id=$1 AND project_id=$2 AND actor_id=$3 AND revoked_at IS NULL RETURNING ${receiptColumns}`,
      [shareId, project, actor],
    )
    const parsed = parcelShareReceiptSchema.safeParse(saved.rows[0])
    if (
      saved.rowCount !== 1 ||
      saved.rows.length !== 1 ||
      !parsed.success ||
      !parsed.data.revokedAt ||
      canonicalJSON({ ...parsed.data, revokedAt: null }) !==
        canonicalJSON(original)
    )
      throw fail('Revocation was not acknowledged exactly.')
    return parsed.data
  })
}
export async function readPublicParcelShare(shareId: string, key: string) {
  const result = await db.query<{ payload: unknown }>(
    'SELECT public.read_parcel_draft_share($1::uuid,$2::text) payload',
    [shareId, parcelShareKeyHash(key)],
  )
  const parsed = publicParcelShareSchema.safeParse(result.rows[0]?.payload)
  if (
    !parsed.success ||
    parsed.data.id !== shareId ||
    Date.parse(parsed.data.expiresAt) <= Date.now() ||
    hashSchemeValue(parsed.data.snapshot) !== parsed.data.snapshotHash
  )
    return null
  // Re-parse through the strict allowlist before any public serialization.
  return {
    ...parsed.data,
    snapshot: parcelShareSnapshotSchema.parse(parsed.data.snapshot),
  }
}
