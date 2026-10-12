import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { canAccess } from '@/lib/subscription/featureGates'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import { makeOrganizationSlug } from '@/lib/organizations/security'

export const dynamic = 'force-dynamic'

const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(255),
  contactEmail: z.string().trim().email().max(255).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(2000).optional(),
})

interface OrganizationListRow {
  id: string
  name: string
  slug: string
  plan: string
  max_seats: number
  owner_id: string | null
  role: string
  created_at: string
}

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60_000 } },
  async (_req, ctx) => {
    const { rows } = await db.query<OrganizationListRow>(
      `SELECT organization.id, organization.name, organization.slug,
              COALESCE(entitlement.effective_plan, organization.plan) AS plan,
              COALESCE(entitlement.max_seats, organization.max_seats) AS max_seats,
              organization.owner_id,
              membership.role, organization.created_at
         FROM public.organization_members AS membership
         JOIN public.organizations AS organization
           ON organization.id = membership.organization_id
         LEFT JOIN LATERAL public.organization_subscription_limit(organization.id) AS entitlement ON TRUE
        WHERE membership.user_id = $1
          AND membership.is_active = TRUE
          AND organization.is_active = TRUE
        ORDER BY membership.accepted_at DESC NULLS LAST, membership.invited_at DESC`,
      [ctx.userId],
    )
    const subscription = await getSubscription(ctx.userId, ctx.session?.user?.email ?? undefined)
    const plan = subscription?.plan ?? 'free'

    return NextResponse.json(
      {
        organizations: rows,
        plan,
        canCreate: canAccess(plan as 'free' | 'pro' | 'team' | 'firm' | 'enterprise', 'team_seats'),
        maxSeats: subscription?.maxTeamMembers ?? 1,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)

export const POST = apiHandler(
  { auth: true, schema: CreateOrganizationSchema, rateLimit: { max: 3, windowMs: 60 * 60_000 } },
  async (_req, ctx) => {
    const body = ctx.body as z.infer<typeof CreateOrganizationSchema>
    const subscription = await getSubscription(ctx.userId, ctx.session?.user?.email ?? undefined)
    if (!subscription || !canAccess(subscription.plan, 'team_seats')) {
      return NextResponse.json(
        { error: 'Firm workspaces require a Team, Firm, or Enterprise subscription.', code: 'TEAM_PLAN_REQUIRED', upgradePath: '/pricing?plan=team' },
        { status: 402 },
      )
    }

    const slug = makeOrganizationSlug(body.name)
    const created = await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`owner:${ctx.userId}`])
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM public.organizations WHERE owner_id = $1 AND is_active = TRUE LIMIT 1',
        [ctx.userId],
      )
      if (existing.rows.length > 0) return { error: 'organization_already_exists' as const }

      const { rows } = await client.query<{
        id: string
        name: string
        slug: string
        plan: string
        max_seats: number
      }>(
        `INSERT INTO public.organizations
           (name, slug, owner_id, plan, max_seats, contact_email, contact_phone, address)
         VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))
         RETURNING id, name, slug, plan, max_seats`,
        [body.name, slug, ctx.userId, subscription.plan, subscription.maxTeamMembers, body.contactEmail ?? '', body.contactPhone ?? '', body.address ?? ''],
      )
      const organization = rows[0]
      await client.query(
        `INSERT INTO public.organization_members
           (organization_id, user_id, role, invited_by, invited_at, accepted_at, is_active)
         VALUES ($1, $2, 'org_admin', $2, NOW(), NOW(), TRUE)`,
        [organization.id, ctx.userId],
      )
      return { organization }
    })

    if ('error' in created) {
      return NextResponse.json({ error: 'This account already owns an active firm workspace.', code: 'ORGANIZATION_ALREADY_EXISTS' }, { status: 409 })
    }

    return NextResponse.json({ organization: created.organization, role: 'org_admin' }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  },
)
