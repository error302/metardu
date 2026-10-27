export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { verifyFieldbookChain } from '@/lib/audit/fieldbookChain'
interface AuditEventRow {
  id: string
  table_name: string
  row_id: string
  user_id: string | null
  user_email: string | null
  action: string
  summary: string | null
  prev_hash: string | null
  hash: string
  created_at: Date
  payload: unknown
}

import { z } from 'zod'

/**
 * GET /api/fieldbook/audit?project_id=<uuid>&limit=100
 *   Returns the cross-table audit event stream for the requesting
 *   surveyor, or the team's events for an accessible project. Newest first.
 *
 * The events come from the fieldbook_audit_events table populated by
 * the fieldbook_signed_audit_func trigger (migration 015). Each event
 * records predecessor hashes; these are not digital signatures or proof
 * that the underlying measurements are correct.
 */
export const GET = apiHandler({
  requireAuth: true,
  rateLimit: { max: 60, windowMs: 60_000 },
  handler: async (ctx) => {
    const url = new URL(ctx.req.url)
    const projectId = url.searchParams.get('project_id') || null
    const rawLimit = url.searchParams.get('limit') || '100'
    if ((projectId && !z.string().guid().safeParse(projectId).success)
      || !/^[0-9]+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) {
      return NextResponse.json({ error: 'Provide a valid project UUID and positive integer limit.' }, { status: 400 })
    }
    const limit = Math.min(Number(rawLimit), 500)

    // RLS scopes the event's recorded project, including deleted source rows.
    const params: unknown[] = [projectId || ctx.userId]
    const whereClause = projectId ? 'WHERE fae.project_id = $1' : 'WHERE fae.user_id = $1'
    params.push(limit)

    const { rows } = await db.query<AuditEventRow>(
      `SELECT
         fae.id,
         fae.table_name,
         fae.row_id,
         fae.user_id,
         u.email AS user_email,
         fae.action,
         fae.summary,
         fae.prev_hash,
         fae.hash,
         fae.created_at,
         fae.payload
       FROM fieldbook_audit_events fae
       LEFT JOIN users u ON u.id = fae.user_id
       ${whereClause}
       ORDER BY fae.created_at DESC
       LIMIT $${params.length}`,
      params
    )

    return NextResponse.json({ events: rows, count: rows.length }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  },
})

/**
 * POST /api/fieldbook/audit/verify
 *   Checks predecessor links of accessible audit history.
 *   Returns { valid: true } if every prev_hash matches the prior hash,
 *   otherwise { valid: false, broken_at: <event_id> }.
 *
 * Does not verify digital signatures, payload hashes, or survey acceptance.
 */
const verifySchema = z.object({
  row_id: z.string().guid(),
  table_name: z.enum(['project_fieldbook_entries', 'survey_points']),
})

export const POST = apiHandler({
  requireAuth: true,
  schema: verifySchema,
  rateLimit: { max: 30, windowMs: 60_000 },
  handler: async (ctx) => {
    const { row_id, table_name } = ctx.input

    const { rows } = await db.query<AuditEventRow>(
      `SELECT id, action, prev_hash, hash, created_at
       FROM fieldbook_audit_events
       WHERE row_id = $1 AND table_name = $2`,
      [row_id, table_name]
    )

    return NextResponse.json(verifyFieldbookChain(rows), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  },
})
