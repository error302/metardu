export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { checkProjectAccess } from '@/lib/security/projectAccess'
import { can, effectiveRole, PROJECT_ROLES } from '@/lib/security/projectPermissions'
import { appendAuditEntry } from '@/lib/audit/auditLog'

interface OwnerRow {
  owner_id: string
  owner_name: string | null
  owner_email: string | null
}

interface MemberRow {
  id: string
  user_id: string
  role: string
  created_at: Date
  name: string | null
  email: string | null
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(PROJECT_ROLES),
})

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(PROJECT_ROLES),
})

/**
 * GET /api/projects/[id]/members
 * Owner and every invited member may list the project's members. Callers with
 * no access get the same 404 as every other project route (no existence leak).
 */
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { id } = ctx.params

  const access = await checkProjectAccess(ctx.userId, id)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const [ownerRes, membersRes] = await Promise.all([
    db.query<OwnerRow>(
      `SELECT p.user_id AS owner_id, u.name AS owner_name, u.email AS owner_email
         FROM projects p JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [id]
    ),
    db.query<MemberRow>(
      `SELECT pm.id, pm.user_id, pm.role, pm.created_at, u.name, u.email
         FROM project_members pm JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY pm.created_at ASC`,
      [id]
    ),
  ])

  return NextResponse.json({
    data: {
      owner: ownerRes.rows[0]
        ? { id: ownerRes.rows[0].owner_id, name: ownerRes.rows[0].owner_name, email: ownerRes.rows[0].owner_email }
        : null,
      members: membersRes.rows.map((m) => ({
        id: m.id,
        userId: m.user_id,
        name: m.name,
        email: m.email,
        role: m.role,
        addedAt: m.created_at,
      })),
      // The caller's own authority, resolved centrally — the sharing panel
      // renders its controls from this instead of re-deriving roles.
      callerRole: effectiveRole(access),
    },
  })
})

/**
 * POST /api/projects/[id]/members — invite a member.
 * Body: { email, role }. Only owner or member admins.
 */
export const POST = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 }, schema: inviteSchema }, async (_req, ctx) => {
  const { id } = ctx.params
  const body = ctx.body as z.infer<typeof inviteSchema>

  const access = await checkProjectAccess(ctx.userId, id)
  const role = effectiveRole(access)
  if (!access.allowed || !can(role, 'members.manage')) {
    return NextResponse.json({ error: 'Only the project owner or admins can manage members' }, { status: 403 })
  }

  // Owner by definition already has full access — a "membership" row for them
  // would be a shadow duplicate of ownership.
  const target = await db.query<{ id: string; email: string; name: string | null }>(
    'SELECT id, email, name FROM users WHERE lower(email) = $1 LIMIT 1',
    [body.email]
  )
  if (target.rows.length === 0) {
    return NextResponse.json({ error: 'No METARDU account uses that email yet' }, { status: 404 })
  }
  const user = target.rows[0]
  const ownerRes = await db.query<{ user_id: string }>('SELECT user_id FROM projects WHERE id = $1', [id])
  if (ownerRes.rows[0]?.user_id === user.id) {
    return NextResponse.json({ error: 'That account already owns this project' }, { status: 409 })
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO NOTHING
     RETURNING id`,
    [id, user.id, body.role]
  )
  if (inserted.rows.length === 0) {
    return NextResponse.json({ error: 'That account is already a member of this project' }, { status: 409 })
  }

  // Tamper-evident trail: who granted what access to whom, and when
  // ("who had access on the day the plan was signed").
  await appendAuditEntry({
    projectId: id,
    userId: ctx.userId,
    entityType: 'custom',
    entityId: inserted.rows[0].id,
    action: 'create',
    payload: { metadata: { memberAction: 'invite', targetUserId: user.id, targetEmail: user.email, role: body.role } },
  }).catch(() => undefined)

  return NextResponse.json({ data: { id: inserted.rows[0].id, userId: user.id, email: user.email, role: body.role } }, { status: 201 })
})

/**
 * PATCH /api/projects/[id]/members — change a member's role.
 * Body: { userId, role }.
 */
export const PATCH = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 }, schema: roleChangeSchema }, async (_req, ctx) => {
  const { id } = ctx.params
  const body = ctx.body as z.infer<typeof roleChangeSchema>

  const access = await checkProjectAccess(ctx.userId, id)
  const role = effectiveRole(access)
  if (!access.allowed || !can(role, 'members.manage')) {
    return NextResponse.json({ error: 'Only the project owner or admins can manage members' }, { status: 403 })
  }

  const updated = await db.query<{ id: string }>(
    `UPDATE project_members SET role = $3
      WHERE project_id = $1 AND user_id = $2
      RETURNING id`,
    [id, body.userId, body.role]
  )
  if (updated.rows.length === 0) {
    return NextResponse.json({ error: 'That account is not a member of this project' }, { status: 404 })
  }

  await appendAuditEntry({
    projectId: id,
    userId: ctx.userId,
    entityType: 'custom',
    entityId: updated.rows[0].id,
    action: 'update',
    payload: { metadata: { memberAction: 'role-change', targetUserId: body.userId, role: body.role } },
  }).catch(() => undefined)

  return NextResponse.json({ data: { userId: body.userId, role: body.role } })
})

/**
 * DELETE /api/projects/[id]/members?userId=<uuid> — revoke a membership.
 */
export const DELETE = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params
  const targetUserId = req.nextUrl.searchParams.get('userId')
  if (!targetUserId || !z.string().uuid().safeParse(targetUserId).success) {
    return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 })
  }

  const access = await checkProjectAccess(ctx.userId, id)
  const role = effectiveRole(access)
  if (!access.allowed || !can(role, 'members.manage')) {
    return NextResponse.json({ error: 'Only the project owner or admins can manage members' }, { status: 403 })
  }

  const removed = await db.query<{ id: string; user_id: string; role: string }>(
    `DELETE FROM project_members
      WHERE project_id = $1 AND user_id = $2
      RETURNING id, user_id, role`,
    [id, targetUserId]
  )
  if (removed.rows.length === 0) {
    return NextResponse.json({ error: 'That account is not a member of this project' }, { status: 404 })
  }

  await appendAuditEntry({
    projectId: id,
    userId: ctx.userId,
    entityType: 'custom',
    entityId: removed.rows[0].id,
    action: 'delete',
    payload: { metadata: { memberAction: 'revoke', targetUserId: removed.rows[0].user_id, revokedRole: removed.rows[0].role } },
  }).catch(() => undefined)

  return NextResponse.json({ data: { userId: targetUserId, removed: true } })
})
