import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setCurrentOrgId } from '@/lib/db'
import { canManageOrganizationMembers } from '@/lib/organizations/security'

export const dynamic = 'force-dynamic'

const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(255),
  contactEmail: z.string().trim().email().max(255).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(2000).optional(),
})

interface OrganizationRow {
  id: string
  name: string
  slug: string
  plan: string
  max_seats: number
  owner_id: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  created_at: string
  updated_at: string
}

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60_000 } },
  async (_req, ctx) => {
    const organizationId = z.string().uuid().safeParse(ctx.params.organizationId)
    if (!organizationId.success) return NextResponse.json({ error: 'Invalid organization id' }, { status: 400 })

    const membership = await db.query<{ role: string }>(
      `SELECT role FROM public.organization_members
        WHERE organization_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1`,
      [organizationId.data, ctx.userId],
    )
    if (!membership.rows[0]) return NextResponse.json({ error: 'Firm workspace not found' }, { status: 404 })
    setCurrentOrgId(organizationId.data)

    const { rows: organizations } = await db.query<OrganizationRow>(
      `SELECT organization.id, organization.name, organization.slug,
              COALESCE(entitlement.effective_plan, organization.plan) AS plan,
              COALESCE(entitlement.max_seats, organization.max_seats) AS max_seats,
              organization.owner_id, organization.contact_email,
              organization.contact_phone, organization.address,
              organization.created_at, organization.updated_at
         FROM public.organizations AS organization
         LEFT JOIN LATERAL public.organization_subscription_limit(organization.id) AS entitlement ON TRUE
        WHERE organization.id = $1 AND organization.is_active = TRUE LIMIT 1`,
      [organizationId.data],
    )
    const organization = organizations[0]
    if (!organization) return NextResponse.json({ error: 'Firm workspace not found' }, { status: 404 })

    const countRows = canManageOrganizationMembers(membership.rows[0].role)
      ? await db.query<{ member_count: string; project_count: string }>(
      `SELECT
         (SELECT COUNT(*) FROM public.organization_members member
           WHERE member.organization_id = $1 AND member.is_active = TRUE)::text AS member_count,
         (SELECT COUNT(*) FROM public.projects project
           WHERE project.organization_id = $1)::text AS project_count`,
      [organizationId.data],
      )
      : { rows: [] as Array<{ member_count: string; project_count: string }> }

    const role = membership.rows[0].role
    let members: Array<Record<string, unknown>> = []
    let invitations: Array<Record<string, unknown>> = []
    if (canManageOrganizationMembers(role)) {
      const [membersResult, invitationsResult] = await Promise.all([
        db.query(
          `SELECT member_id AS id, user_id, role, accepted_at, email, full_name
             FROM public.list_organization_members($1)`,
          [organizationId.data],
        ),
        db.query(
          `SELECT id, email, role, expires_at, created_at
             FROM public.organization_invitations
            WHERE organization_id = $1 AND accepted_at IS NULL
              AND revoked_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC`,
          [organizationId.data],
        ),
      ])
      members = membersResult.rows
      invitations = invitationsResult.rows
    }

    return NextResponse.json(
      {
        organization,
        role,
        canManageMembers: canManageOrganizationMembers(role),
        memberCount: countRows.rows[0] ? Number(countRows.rows[0].member_count) : null,
        projectCount: countRows.rows[0] ? Number(countRows.rows[0].project_count) : null,
        members,
        invitations,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)

export const PATCH = apiHandler(
  { auth: true, schema: UpdateOrganizationSchema, rateLimit: { max: 20, windowMs: 60_000 } },
  async (_req, ctx) => {
    const organizationId = z.string().uuid().safeParse(ctx.params.organizationId)
    if (!organizationId.success) return NextResponse.json({ error: 'Invalid organization id' }, { status: 400 })
    const body = ctx.body as z.infer<typeof UpdateOrganizationSchema>

    const { rows } = await db.query<{ owner_id: string | null }>(
      'SELECT owner_id FROM public.organizations WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [organizationId.data],
    )
    if (!rows[0]) return NextResponse.json({ error: 'Firm workspace not found' }, { status: 404 })
    if (rows[0].owner_id !== ctx.userId) return NextResponse.json({ error: 'Only the firm owner can edit firm details.' }, { status: 403 })
    setCurrentOrgId(organizationId.data)

    const result = await db.query<OrganizationRow>(
      `UPDATE public.organizations
          SET name = $1, contact_email = NULLIF($2, ''), contact_phone = NULLIF($3, ''),
              address = NULLIF($4, ''), updated_at = NOW()
        WHERE id = $5 AND owner_id = $6 AND is_active = TRUE
        RETURNING id, name, slug, plan, max_seats, owner_id, contact_email,
                  contact_phone, address, created_at, updated_at`,
      [body.name, body.contactEmail ?? '', body.contactPhone ?? '', body.address ?? '', organizationId.data, ctx.userId],
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Firm details could not be updated.' }, { status: 409 })
    return NextResponse.json({ organization: result.rows[0] }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
)
