import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setCurrentOrgId } from '@/lib/db'
import { canAssignOrganizationRole, canManageOrganizationMembers, type OrganizationRole } from '@/lib/organizations/security'

export const dynamic = 'force-dynamic'

const UpdateMemberSchema = z.object({ role: z.enum(['org_admin', 'project_manager', 'surveyor', 'viewer']) })

interface MemberRow {
  id: string
  user_id: string
  role: OrganizationRole
  is_active: boolean
  owner_id: string | null
}

async function getMemberAdminContext(organizationId: string, userId: string) {
  const membership = await db.query<{ role: string }>(
    `SELECT role FROM public.organization_members
      WHERE organization_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1`,
    [organizationId, userId],
  )
  if (!canManageOrganizationMembers(membership.rows[0]?.role)) return null
  setCurrentOrgId(organizationId)
  const organization = await db.query<{ owner_id: string | null }>(
    'SELECT owner_id FROM public.organizations WHERE id = $1 AND is_active = TRUE LIMIT 1',
    [organizationId],
  )
  return organization.rows[0] ?? null
}

export const PATCH = apiHandler(
  { auth: true, schema: UpdateMemberSchema, rateLimit: { max: 30, windowMs: 60_000 } },
  async (_req, ctx) => {
    const parsedOrgId = z.string().guid().safeParse(ctx.params.organizationId)
    const parsedMemberId = z.string().guid().safeParse(ctx.params.memberId)
    if (!parsedOrgId.success || !parsedMemberId.success) return NextResponse.json({ error: 'Invalid organization or member id' }, { status: 400 })
    const organization = await getMemberAdminContext(parsedOrgId.data, ctx.userId)
    if (!organization) return NextResponse.json({ error: 'Firm administrator access is required.' }, { status: 403 })

    const { role: nextRole } = ctx.body as z.infer<typeof UpdateMemberSchema>
    const result = await db.transaction(async (client) => {
      await client.query<{ pg_advisory_xact_lock: string }>('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [parsedOrgId.data])
      const { rows } = await client.query<MemberRow>(
        `SELECT id, user_id, role, is_active
           FROM public.organization_members
          WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
          LIMIT 1`,
        [parsedMemberId.data, parsedOrgId.data],
      )
      const member = rows[0]
      if (!member) return { error: 'member_not_found' as const }
      const targetIsOwner = member.user_id === organization.owner_id
      if (!canAssignOrganizationRole({ actorRole: 'org_admin', actorIsOwner: ctx.userId === organization.owner_id, targetIsOwner, nextRole })) {
        return { error: nextRole === 'org_admin' ? 'owner_required' as const : 'owner_protected' as const }
      }
      if (member.role === 'org_admin' && nextRole !== 'org_admin') {
        const admins = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.organization_members
            WHERE organization_id = $1 AND role = 'org_admin' AND is_active = TRUE`,
          [parsedOrgId.data],
        )
        if (Number(admins.rows[0]?.count ?? 0) <= 1) return { error: 'last_admin' as const }
      }
      await client.query<never>(
        `UPDATE public.organization_members SET role = $1
          WHERE id = $2 AND organization_id = $3 AND is_active = TRUE`,
        [nextRole, parsedMemberId.data, parsedOrgId.data],
      )
      return { role: nextRole }
    })
    if ('error' in result && result.error !== undefined) {
      switch (result.error) {
        case 'member_not_found': return NextResponse.json({ error: 'Active firm member not found.', code: 'MEMBER_NOT_FOUND' }, { status: 404 })
        case 'owner_required': return NextResponse.json({ error: 'Only the firm owner can promote another member to firm administrator.', code: 'OWNER_REQUIRED' }, { status: 403 })
        case 'owner_protected': return NextResponse.json({ error: 'The firm owner role cannot be changed here.', code: 'OWNER_PROTECTED' }, { status: 403 })
        case 'last_admin': return NextResponse.json({ error: 'A firm must keep at least one active administrator.', code: 'LAST_ADMIN' }, { status: 409 })
      }
    }
    return NextResponse.json({ memberId: parsedMemberId.data, role: result.role }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
)

export const DELETE = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60_000 } },
  async (_req, ctx) => {
    const parsedOrgId = z.string().guid().safeParse(ctx.params.organizationId)
    const parsedMemberId = z.string().guid().safeParse(ctx.params.memberId)
    if (!parsedOrgId.success || !parsedMemberId.success) return NextResponse.json({ error: 'Invalid organization or member id' }, { status: 400 })
    const organization = await getMemberAdminContext(parsedOrgId.data, ctx.userId)
    if (!organization) return NextResponse.json({ error: 'Firm administrator access is required.' }, { status: 403 })

    const result = await db.transaction(async (client) => {
      await client.query<{ pg_advisory_xact_lock: string }>('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [parsedOrgId.data])
      const { rows } = await client.query<MemberRow>(
        `SELECT id, user_id, role, is_active
           FROM public.organization_members
          WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
          LIMIT 1`,
        [parsedMemberId.data, parsedOrgId.data],
      )
      const member = rows[0]
      if (!member) return { error: 'member_not_found' as const }
      if (member.user_id === organization.owner_id) return { error: 'owner_protected' as const }
      if (member.user_id === ctx.userId) return { error: 'self_removal' as const }
      if (member.role === 'org_admin') {
        const admins = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM public.organization_members
            WHERE organization_id = $1 AND role = 'org_admin' AND is_active = TRUE`,
          [parsedOrgId.data],
        )
        if (Number(admins.rows[0]?.count ?? 0) <= 1) return { error: 'last_admin' as const }
      }
      await client.query<never>(
        `UPDATE public.organization_members SET is_active = FALSE
          WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
        [parsedMemberId.data, parsedOrgId.data],
      )
      return { removed: true }
    })
    if ('error' in result && result.error !== undefined) {
      switch (result.error) {
        case 'member_not_found': return NextResponse.json({ error: 'Active firm member not found.', code: 'MEMBER_NOT_FOUND' }, { status: 404 })
        case 'owner_protected': return NextResponse.json({ error: 'The firm owner cannot be removed from their organization.', code: 'OWNER_PROTECTED' }, { status: 403 })
        case 'self_removal': return NextResponse.json({ error: 'Ask another firm administrator to remove your membership.', code: 'SELF_REMOVAL' }, { status: 409 })
        case 'last_admin': return NextResponse.json({ error: 'A firm must keep at least one active administrator.', code: 'LAST_ADMIN' }, { status: 409 })
      }
    }
    return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
)
