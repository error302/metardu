import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { hashOrganizationInvitationToken } from '@/lib/organizations/security'

export const dynamic = 'force-dynamic'

const AcceptInvitationSchema = z.object({ token: z.string().min(32).max(64) })

interface AcceptInvitationRow {
  outcome: string
  organization_id: string | null
  role: string | null
}

const responses: Record<string, { status: number; message: string }> = {
  unauthorized: { status: 401, message: 'Sign in before accepting this invitation.' },
  account_not_found: { status: 401, message: 'Your account could not be verified. Sign in again and retry.' },
  email_unverified: { status: 403, message: 'Verify your METARDU account email before accepting a firm invitation.' },
  plan_inactive: { status: 402, message: 'This firm subscription no longer includes team access. Ask its owner to restore the team plan before accepting.' },
  invalid_invitation: { status: 404, message: 'This invitation is invalid, already used, or revoked.' },
  organization_unavailable: { status: 410, message: 'This firm workspace is no longer active.' },
  invitation_expired: { status: 410, message: 'This invitation expired. Ask a firm administrator to send a new one.' },
  email_mismatch: { status: 403, message: 'Sign in with the verified email address that received this invitation.' },
  already_member: { status: 409, message: 'Your account is already an active member of this firm.' },
  seat_limit_reached: { status: 409, message: 'The firm has no unassigned seat available. Ask its owner to review the subscription.' },
}

export const POST = apiHandler(
  { auth: true, schema: AcceptInvitationSchema, rateLimit: { max: 8, windowMs: 60_000 } },
  async (_req, ctx) => {
    const { token } = ctx.body as z.infer<typeof AcceptInvitationSchema>
    const { rows } = await db.query<AcceptInvitationRow>(
      'SELECT outcome, organization_id, role FROM public.accept_organization_invitation($1)',
      [hashOrganizationInvitationToken(token)],
    )
    const result = rows[0]
    if (!result || result.outcome !== 'accepted') {
      const response = responses[result?.outcome ?? 'invalid_invitation'] ?? responses.invalid_invitation
      return NextResponse.json({ error: response.message, code: result?.outcome?.toUpperCase() ?? 'INVALID_INVITATION' }, { status: response.status })
    }
    return NextResponse.json(
      { accepted: true, organizationId: result.organization_id, role: result.role },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
