import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setCurrentOrgId } from '@/lib/db'
import { canManageOrganizationMembers } from '@/lib/organizations/security'

export const dynamic = 'force-dynamic'

export const DELETE = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60_000 } },
  async (_req, ctx) => {
    const organizationId = z.string().guid().safeParse(ctx.params.organizationId)
    const invitationId = z.string().guid().safeParse(ctx.params.invitationId)
    if (!organizationId.success || !invitationId.success) return NextResponse.json({ error: 'Invalid organization or invitation id' }, { status: 400 })

    const { rows: membership } = await db.query<{ role: string }>(
      `SELECT role FROM public.organization_members
        WHERE organization_id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1`,
      [organizationId.data, ctx.userId],
    )
    if (!canManageOrganizationMembers(membership[0]?.role)) return NextResponse.json({ error: 'Firm administrator access is required.' }, { status: 403 })
    setCurrentOrgId(organizationId.data)

    const result = await db.query<{ id: string }>(
      `UPDATE public.organization_invitations
          SET revoked_at = NOW()
        WHERE id = $1 AND organization_id = $2
          AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING id`,
      [invitationId.data, organizationId.data],
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 })
    return NextResponse.json({ revoked: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
)
