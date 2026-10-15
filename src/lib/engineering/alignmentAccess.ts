import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { AuthorizationError, NotFoundError } from '@/lib/api/errors'

export interface OwnedAlignment extends Record<string, unknown> {
  id: string; project_id: string; project_owner: string | null
  start_chainage: number | string | null; coordinate_system: string | null
}

/** Serialize edits and ownership changes on the same transaction client. */
export async function lockOwnedAlignment(client: PoolClient, id: string, userId: string): Promise<OwnedAlignment> {
  const { rows: linked } = await client.query<{ project_id: string }>('SELECT project_id FROM road_alignments WHERE id = $1', [id])
  if (!linked[0]) throw new NotFoundError('Alignment not found')
  // All writers lock project before alignment; header and child edits cannot
  // deadlock by acquiring these locks in opposite orders.
  const { rows: projects } = await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id = $1 FOR UPDATE', [linked[0].project_id])
  if (!projects[0] || !userId || projects[0].user_id !== userId) throw new AuthorizationError('The alignment requires its recorded project owner.')
  const { rows } = await client.query<OwnedAlignment>(`SELECT ra.*, p.user_id AS project_owner
    FROM road_alignments ra JOIN projects p ON p.id = ra.project_id
    WHERE ra.id = $1 AND ra.project_id = $2 FOR UPDATE OF ra`, [id, linked[0].project_id])
  if (!rows[0]) throw new NotFoundError('Alignment not found')
  if (!userId || !rows[0].project_owner || rows[0].project_owner !== userId) throw new AuthorizationError('The alignment requires its recorded project owner.')
  return rows[0]
}

export async function alignmentReadAccess(id: string, userId: string) {
  const { rows } = await db.query<{ project_id: string }>('SELECT project_id FROM road_alignments WHERE id = $1', [id])
  if (!rows[0]) throw new NotFoundError('Alignment not found')
  return requireProjectReadAccess(rows[0].project_id, userId)
}
