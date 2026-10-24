export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { projectSettingsPatchSchema } from '@/lib/validation/projectSettings'
import { CacheKeys, projectCache } from '@/lib/cache/memory-cache'

/** Save only explicitly changed metadata; the database merges closure evidence atomically. */
export const PATCH = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const parsed = projectSettingsPatchSchema.safeParse(ctx.body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid project details', issues: parsed.error.issues }, { status: 400 })
  }
  const values: unknown[] = []
  const assignments = Object.entries(parsed.data).map(([column, value]) => {
    values.push(column === 'linear_error_m' ? JSON.stringify(value) : value)
    // Column names come exclusively from the strict schema, never directly from request keys.
    return column === 'linear_error_m'
      ? `traverse = jsonb_set(COALESCE(traverse, '{}'::jsonb), '{linearError}', $${values.length}::jsonb, true)`
      : `"${column}" = $${values.length}`
  })
  values.push(ctx.params.id, ctx.userId)
  const result = await db.query<{ id: string }>(
    `UPDATE projects SET ${assignments.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}
     ${'linear_error_m' in parsed.data ? "AND (traverse IS NULL OR jsonb_typeof(traverse) = 'object')" : ''} RETURNING id`,
    values,
  )
  if (result.rowCount !== 1 || result.rows.length !== 1 || result.rows[0].id !== ctx.params.id) {
    return NextResponse.json({ error: 'Project update was not confirmed. Access or saved evidence may have changed; reload before retrying.' }, { status: 409 })
  }
  projectCache.invalidate(CacheKeys.project(ctx.params.id))
  return NextResponse.json({ data: { id: result.rows[0].id }, success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
})

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params

  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT p.*,
      sd.scheme_number, sd.county, sd.sub_county, sd.ward,
      sd.planned_parcels, sd.adjudication_section
     FROM projects p
     LEFT JOIN scheme_details sd ON sd.project_id = p.id
     WHERE p.id = $1 AND p.user_id = $2`,
    [id, ctx.userId]
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({ data: rows[0] }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/**
 * DELETE /api/project/[id]
 *
 * Deletes a project and ALL related data in a single statement.
 * All child tables have ON DELETE CASCADE, so PostgreSQL handles
 * the full cleanup automatically — no manual DELETE per table needed.
 *
 * Steps:
 * 1. Verify authentication and ownership
 * 2. Log the deletion in audit_logs (before the project disappears)
 * 3. Execute: DELETE FROM projects WHERE id = $1 AND user_id = $2
 *    → CASCADE propagates to every child row
 */
export const DELETE = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params

  // ── Verify project exists and belongs to the authenticated user ──
  const { rows: projectRows } = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM projects WHERE id = $1 AND user_id = $2',
    [id, ctx.userId]
  )
  if (projectRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const projectName = projectRows[0].name

  // ── Audit log before deletion (non-blocking — never fail the delete if audit fails) ──
  try {
    await db.query<never>(
      `INSERT INTO audit_logs (action, table_name, record_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'DELETE',
        'projects',
        id,
        ctx.userId,
        JSON.stringify({ project_name: projectName, message: 'Project deleted with CASCADE' }),
      ]
    )
  } catch (auditErr) {
    logger.warn('[DELETE /api/project] audit_logs insert failed (non-fatal):', { error: auditErr })
  }

  // ── Single DELETE — CASCADE handles all child tables automatically ──
  const { rowCount } = await db.query<never>(
    'DELETE FROM projects WHERE id = $1 AND user_id = $2',
    [id, ctx.userId]
  )

  if (rowCount === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
})
