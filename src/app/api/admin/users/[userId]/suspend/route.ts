import { apiHandler, apiSuccess, type ApiHandlerContext } from '@/lib/apiHandler'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { z } from 'zod'

interface UserRow { id: string; email: string }
export const dynamic = 'force-dynamic'
const suspendSchema = z.object({ reason: z.string().min(1, 'Suspension reason is required') })

async function changeSuspension(request: Pick<Request, 'headers'>, ctx: Pick<ApiHandlerContext, 'userId' | 'params'>, suspended: boolean, reason?: string) {
  // Both entry points have already revalidated platform administrator access.
  setCurrentRlsServiceRole('platform_admin')
  const { userId } = ctx.params
  if (!z.string().guid().safeParse(userId).success) return apiSuccess({ error: 'Invalid user ID' }, 400)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return db.transaction(async client => {
    // Hold the account lock through the profile change and its audit entry.
    const { rows } = await client.query<UserRow>('SELECT id, email FROM users WHERE id=$1 FOR UPDATE', [userId])
    if (!rows[0]) return apiSuccess({ error: 'User not found' }, 404)
    if (suspended) {
      await client.query<never>(`INSERT INTO surveyor_profiles(id,user_id,role,is_suspended,suspension_reason)
        VALUES (gen_random_uuid(),$1,'surveyor',true,$2)
        ON CONFLICT (user_id) DO UPDATE SET is_suspended=true,suspension_reason=$2`, [userId, reason])
    } else {
      await client.query<never>('UPDATE surveyor_profiles SET is_suspended=false,suspension_reason=NULL WHERE user_id=$1', [userId])
    }
    await logAuditEvent({
      userId: ctx.userId, action: suspended ? 'user.suspend' : 'user.unsuspend', resourceType: 'user', resourceId: userId,
      details: { ...(suspended ? { reason } : {}), targetEmail: rows[0].email }, ipAddress: clientIp, timestamp: new Date(),
    }, client)
    return apiSuccess({ success: true, userId, suspended })
  })
}

// Firm administrators manage their organization memberships; global account
// suspension/restoration is reserved for platform administrators.
export const POST = apiHandler(
  { auth: true, roles: ['super_admin', 'admin'], schema: suspendSchema, rateLimit: { max: 60, windowMs: 60000 } },
  (request, ctx) => changeSuspension(request, ctx, true, (ctx.body as z.infer<typeof suspendSchema>).reason),
)
export const DELETE = apiHandler(
  { auth: true, roles: ['super_admin', 'admin'], rateLimit: { max: 60, windowMs: 60000 } },
  (request, ctx) => changeSuspension(request, ctx, false),
)
