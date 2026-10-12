import { db, setCurrentUserId, setCurrentOrgId } from '@/lib/db'

/** Bind synchronously in the caller's async context, including after any await. */
export function setAuthenticatedDatabaseContext(userId: string | null, organizationId: string | null = null): void {
  setCurrentUserId(userId)
  setCurrentOrgId(organizationId)
}

export async function resolveAuthenticatedOrganization(userId: string): Promise<string | null> {
  const { rows } = await db.query<{ organization_id: string }>(
    `SELECT member.organization_id
       FROM public.organization_members member
       JOIN public.organizations organization ON organization.id = member.organization_id
      WHERE member.user_id = $1 AND member.is_active = TRUE AND organization.is_active = TRUE
      ORDER BY member.accepted_at DESC NULLS LAST, member.invited_at DESC, member.organization_id
      LIMIT 1`,
    [userId],
  )
  return rows[0]?.organization_id ?? null
}
