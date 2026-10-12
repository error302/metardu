import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setCurrentOrgId } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { canManageOrganizationMembers, createOrganizationInvitationToken, hasSeatCapacity, type InvitableOrganizationRole } from '@/lib/organizations/security'
import { canAccess } from '@/lib/subscription/featureGates'
import type { PlanId } from '@/lib/subscription/catalog'

export const dynamic = 'force-dynamic'

const CreateInvitationSchema = z.object({
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  role: z.enum(['project_manager', 'surveyor', 'viewer']),
})

function invitationBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://metardu.space'
  try {
    const parsed = new URL(configured)
    if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
      return parsed.origin
    }
  } catch {
    // Fall through to the known production origin.
  }
  return 'https://metardu.space'
}

interface OrganizationRow {
  id: string
  name: string
  plan: string
  max_seats: number
  is_active: boolean
}

async function getAdminOrganization(organizationId: string, userId: string) {
  const membership = await db.query<{ role: string }>(
    `SELECT role FROM public.organization_members
      WHERE organization_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1`,
    [organizationId, userId],
  )
  if (!canManageOrganizationMembers(membership.rows[0]?.role)) return null
  setCurrentOrgId(organizationId)
  const organization = await db.query<OrganizationRow>(
    `SELECT id, name, plan, max_seats, is_active
       FROM public.organizations WHERE id = $1 LIMIT 1`,
    [organizationId],
  )
  return organization.rows[0] ?? null
}

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60_000 } },
  async (_req, ctx) => {
    const organizationId = z.string().uuid().safeParse(ctx.params.organizationId)
    if (!organizationId.success) return NextResponse.json({ error: 'Invalid organization id' }, { status: 400 })
    const organization = await getAdminOrganization(organizationId.data, ctx.userId)
    if (!organization) return NextResponse.json({ error: 'Only firm administrators can view invitations.' }, { status: 403 })

    const { rows } = await db.query(
      `SELECT id, email, role, expires_at, created_at
         FROM public.organization_invitations
        WHERE organization_id = $1 AND accepted_at IS NULL
          AND revoked_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC`,
      [organizationId.data],
    )
    return NextResponse.json({ invitations: rows }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
)

export const POST = apiHandler(
  { auth: true, schema: CreateInvitationSchema, rateLimit: { max: 12, windowMs: 60 * 60_000 } },
  async (_req, ctx) => {
    const organizationId = z.string().uuid().safeParse(ctx.params.organizationId)
    if (!organizationId.success) return NextResponse.json({ error: 'Invalid organization id' }, { status: 400 })
    const organization = await getAdminOrganization(organizationId.data, ctx.userId)
    if (!organization || !organization.is_active) {
      return NextResponse.json({ error: 'Firm workspace not found or you cannot manage its members.' }, { status: 404 })
    }
    const body = ctx.body as z.infer<typeof CreateInvitationSchema>

    const { token, tokenHash } = createOrganizationInvitationToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const created = await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [organizationId.data])
      const currentOrg = await client.query<OrganizationRow>(
        `SELECT id, name, plan, max_seats, is_active
           FROM public.organizations WHERE id = $1 LIMIT 1`,
        [organizationId.data],
      )
      const current = currentOrg.rows[0]
      if (!current || !current.is_active) return { error: 'organization_unavailable' as const }

      const entitlement = await client.query<{ plan: string; max_seats: number }>(
        `SELECT effective_plan AS plan, max_seats
           FROM public.organization_subscription_limit($1)`,
        [organizationId.data],
      )
      const currentPlan = entitlement.rows[0]?.plan as PlanId | undefined
      if (!currentPlan || !canAccess(currentPlan, 'team_seats')) return { error: 'team_plan_required' as const }

      const matchingMember = await client.query<{ is_member: boolean }>(
        'SELECT public.organization_has_active_member_email($1, $2) AS is_member',
        [organizationId.data, body.email],
      )
      if (matchingMember.rows[0]?.is_member) return { error: 'already_member' as const }

      const occupied = await client.query<{ occupied: string }>(
        `SELECT (
           (SELECT COUNT(*) FROM public.organization_members member
             WHERE member.organization_id = $1 AND member.is_active = TRUE)
           +
           (SELECT COUNT(*) FROM public.organization_invitations invitation
             WHERE invitation.organization_id = $1 AND invitation.accepted_at IS NULL
               AND invitation.revoked_at IS NULL AND invitation.expires_at > NOW())
         )::text AS occupied`,
        [organizationId.data],
      )
      const currentMaxSeats = entitlement.rows[0]?.max_seats ?? current.max_seats ?? 1
      if (!hasSeatCapacity(currentMaxSeats, Number(occupied.rows[0]?.occupied ?? 0))) {
        return { error: 'seat_limit' as const }
      }

      await client.query(
        `UPDATE public.organization_invitations
            SET revoked_at = NOW()
          WHERE organization_id = $1 AND email = $2
            AND accepted_at IS NULL AND revoked_at IS NULL`,
        [organizationId.data, body.email],
      )
      const { rows } = await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO public.organization_invitations
           (organization_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, expires_at`,
        [organizationId.data, body.email, body.role, tokenHash, ctx.userId, expiresAt.toISOString()],
      )
      return { invitation: rows[0], organizationName: current.name }
    })

    if ('error' in created) {
      if (created.error === 'team_plan_required') {
        return NextResponse.json({ error: 'Member invitations require an active Team, Firm, or Enterprise subscription.', code: 'TEAM_PLAN_REQUIRED', upgradePath: '/pricing?plan=team' }, { status: 402 })
      }
      if (created.error === 'already_member') {
        return NextResponse.json({ error: 'That account is already an active member of this firm.' }, { status: 409 })
      }
      if (created.error === 'seat_limit') {
        return NextResponse.json({ error: 'All purchased firm seats are currently assigned or reserved by pending invitations.', code: 'SEAT_LIMIT_REACHED', upgradePath: '/account/billing' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Firm workspace is unavailable.' }, { status: 404 })
    }

    const inviteUrl = `${invitationBaseUrl()}/organization/invitations/accept#token=${encodeURIComponent(token)}`
    const roleLabel = (ctx.body as { role: InvitableOrganizationRole }).role.replace('_', ' ')
    const delivery = await sendEmail({
      to: body.email,
      subject: `Invitation to join ${created.organizationName} on METARDU`,
      text: `You have been invited to join ${created.organizationName} on METARDU as a ${roleLabel}. Sign in using this email address and accept within 7 days:\n\n${inviteUrl}\n\nIf you were not expecting this invitation, you can ignore this message.`,
    })

    return NextResponse.json(
      {
        invitation: { ...created.invitation, email: body.email, role: body.role },
        delivery: delivery.success ? 'email' : 'manual_link',
        inviteUrl: delivery.success ? null : inviteUrl,
        message: delivery.success ? 'Invitation email sent.' : 'Email delivery is not configured. Copy and share this one-time invitation link securely.',
      },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
