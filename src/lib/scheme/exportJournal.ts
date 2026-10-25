import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { hashSchemeValue } from './exportArtifact'
import {
  schemeExportRequestSchema,
  schemeExportIntent,
  type SchemeExportRequest,
  type SchemeExportFormat,
} from './exportContract'
const rowSchema = z.object({
  id: z.string().uuid(),
  actor_id: z.string().uuid(),
  project_id: z.string().uuid(),
  request_id: z.string().uuid(),
  format: z.enum(['dxf', 'geojson']),
  request_hash: z.string().regex(/^[a-f0-9]{64}$/),
  body: schemeExportRequestSchema,
  outcome: z.enum(['committed', 'cancelled']),
  deliverable_revision_id: z.string().uuid().nullable(),
  receipt: z.record(z.unknown()),
})
export type SchemeExportJournal = z.infer<typeof rowSchema>
const failure = () =>
  new AppError(
    'The request outcome or identity differs from the retained export journal. No replacement was generated.',
    409,
    'SCHEME_EXPORT_JOURNAL',
  )
export async function ensureSchemeExportStorage(client?: PoolClient) {
  const sql =
    "SELECT to_regclass('scheme_export_requests') IS NOT NULL available"
  const result = client
    ? await client.query<{ available: boolean }>(sql)
    : await db.query<{ available: boolean }>(sql)
  if (result.rows.length !== 1 || result.rows[0].available !== true)
    throw new AppError(
      'Retained scheme-export storage is unavailable. No export was generated.',
      409,
      'SCHEME_EXPORT_STORAGE',
    )
}
export async function readSchemeExportJournal(
  actor: string,
  project: string,
  requestId: string,
  format: SchemeExportFormat,
  client: PoolClient,
  requestHash?: string,
) {
  const result = await client.query(
    'SELECT * FROM scheme_export_requests WHERE actor_id=$1 AND project_id=$2 AND request_id=$3',
    [actor, project, requestId],
  )
  if (!result.rows.length) return null
  const parsed = rowSchema.safeParse(result.rows[0])
  if (result.rows.length !== 1 || !parsed.success) throw failure()
  const row = parsed.data
  if (
    row.actor_id !== actor ||
    row.project_id !== project ||
    row.request_id !== requestId ||
    row.format !== format ||
    row.body.expectedUserId !== actor ||
    row.body.projectId !== project ||
    row.body.requestId !== requestId ||
    row.request_hash !==
      hashSchemeValue(schemeExportIntent(row.body, format)) ||
    (requestHash && row.request_hash !== requestHash) ||
    (row.outcome === 'committed') !== (row.deliverable_revision_id !== null)
  )
    throw failure()
  return row
}
export async function appendSchemeExportJournal(
  body: SchemeExportRequest,
  format: SchemeExportFormat,
  outcome: 'committed' | 'cancelled',
  receipt: Record<string, unknown>,
  revisionId: string | null,
  client: PoolClient,
) {
  const expected = {
    id: randomUUID(),
    actor_id: body.expectedUserId,
    project_id: body.projectId,
    request_id: body.requestId,
    format,
    request_hash: hashSchemeValue(schemeExportIntent(body, format)),
    body,
    outcome,
    receipt,
    deliverable_revision_id: revisionId,
  }
  const result = await client.query(
    `INSERT INTO scheme_export_requests(id,actor_id,project_id,request_id,format,request_hash,body,outcome,receipt,deliverable_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      expected.id,
      expected.actor_id,
      expected.project_id,
      expected.request_id,
      format,
      expected.request_hash,
      JSON.stringify(body),
      outcome,
      JSON.stringify(receipt),
      revisionId,
    ],
  )
  const parsed = rowSchema.safeParse(result.rows[0])
  if (
    result.rowCount !== 1 ||
    result.rows.length !== 1 ||
    !parsed.success ||
    hashSchemeValue(parsed.data) !== hashSchemeValue(expected)
  )
    throw failure()
  return parsed.data
}
