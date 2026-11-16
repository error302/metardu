export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { canAccessProject } from '@/lib/auth/rbac'
import {
  canManageMembers,
  isProjectMemberRole,
  PROJECT_MEMBER_ROLES,
} from '@/lib/security/projectPermissions'
import { appendAuditEntry } from '@/lib/audit/auditLog'

interface ProjectScopeRow {
  user_id: string
  organization_id: string | null
}

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
  role: z.enum(PROJECT_MEMBER_ROLES),
})

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(PROJECT_MEMBER_ROLES),
})

async function loadScope(projectId: string) {
  const { rows } = await db.query<ProjectScopeRow>(
    'SELECT user_id, organization_id FROM projects WHERE id = $1 LIMIT 1',
    [projectId],
  )
  return rows[0] ?? null
}

function manageContext(access: string | null, scope: ProjectScopeRow | null, userId: string) {
  return {
    allowed: canManageMembers(access, {
      isProjectOwner: scope?.user_id === userId,
      isOrganizationProject: Boolean(scope?.organization_id),
    }),
  }
}

/**
 * GET /api/projects/[id]/members
 * Any recognized project reader may list members. Callers with no access
 * are rejected before any membership data is read (same gate as workflow).
 */
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { id } = ctx.params

  const access = await canAccessProject(ctx.userId, id)
  if (!access) {
    return NextResponse.json({ error: 'Project read access is required.' }, { status: 403 })
  }
  const scope = await loadScope(id)

  const [ownerRes, membersRes] = await Promise.all([
    db.query<OwnerRow>(
      `SELECT p.user_id AS owner_id, u.full_name AS owner_name, u.email AS owner_email
         FROM projects p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [id],
    ),
    db.query<MemberRow>(
      `SELECT pm.id, pm.user_id, pm.role, pm.created_at, u.full_name AS name, u.email
         FROM project_members pm LEFT JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY pm.created_at ASC`,
      [id],
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
      // Resolved centrally so the sharing panel renders controls from the
      // same policy the mutations enforce.
      callerRole: access,
      canManage: manageContext(access, scope, ctx.userId).allowed,
    },
  })
})

/**
 * POST /api/projects/[id]/members — invite a member.
 * Body: { email, role }. Personal projects: owner only (DB RLS).
 * Org projects: owner, org_admin, project_manager.
 */
export const POST = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 }, schema: inviteSchema }, async (_req, ctx) => {
  const { id } = ctx.params
  const body = ctx.body as z.infer<typeof inviteSchema>

  const access = await canAccessProject(ctx.userId, id)
  const scope = access ? await loadScope(id) : null
  if (!access || !manageContext(access, scope, ctx.userId).allowed) {
    return NextResponse.json({ error: 'Only the project owner or project managers can manage members' }, { status: 403 })
  }

  const target = await db.query<{ id: string; email: string; full_name: string | null }>(
    'SELECT id, email, full_name FROM users WHERE lower(email) = $1 LIMIT 1',
    [body.email],
  )
  if (target.rows.length === 0) {
    return NextResponse.json({ error: 'No METARDU account uses that email yet' }, { status: 404 })
  }
  const user = target.rows[0]
  if (scope?.user_id === user.id) {
    return NextResponse.json({ error: 'That account already owns this project' }, { status: 409 })
  }

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1',
    [id, user.id],
  )
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'That account is already a member of this project' }, { status: 409 })
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO NOTHING
     RETURNING id`,
    [id, user.id, body.role],
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

  return NextResponse.json(
    { data: { id: inserted.rows[0].id, userId: user.id, email: user.email, name: user.full_name, role: body.role } },
    { status: 201 },
  )
})

/**
 * PATCH /api/projects/[id]/members — change a member's role.
 * Body: { userId, role }.
 */
export const PATCH = apiHandler({ auth: true, rateLimit: { max: 20, windowMs: 60000 }, schema: roleChangeSchema }, async (_req, ctx) => {
  const { id } = ctx.params
  const body = ctx.body as z.infer<typeof roleChangeSchema>
  if (!isProjectMemberRole(body.role)) {
    return NextResponse.json({ error: 'Unknown member role' }, { status: 400 })
  }

  const access = await canAccessProject(ctx.userId, id)
  const scope = access ? await loadScope(id) : null
  if (!access || !manageContext(access, scope, ctx.userId).allowed) {
    return NextResponse.json({ error: 'Only the project owner or project managers can manage members' }, { status: 403 })
  }

  const updated = await db.query<{ id: string }>(
    `UPDATE project_members SET role = $3
      WHERE project_id = $1 AND user_id = $2
      RETURNING id`,
    [id, body.userId, body.role],
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

  const access = await canAccessProject(ctx.userId, id)
  const scope = access ? await loadScope(id) : null
  if (!access || !manageContext(access, scope, ctx.userId).allowed) {
    return NextResponse.json({ error: 'Only the project owner or project managers can manage members' }, { status: 403 })
  }

  const removed = await db.query<{ id: string; user_id: string; role: string }>(
    `DELETE FROM project_members
      WHERE project_id = $1 AND user_id = $2
      RETURNING id, user_id, role`,
    [id, targetUserId],
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
