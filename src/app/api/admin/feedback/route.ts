import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { PLATFORM_ADMIN_API_ROLES } from '@/lib/auth/rbac'
import { feedbackUpdateSchema } from '@/lib/admin/dashboardContract'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import type { z } from 'zod'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(
  { auth: true, roles: PLATFORM_ADMIN_API_ROLES, schema: feedbackUpdateSchema, rateLimit: { max: 30, windowMs: 60000 } },
  async (_request, ctx) => {
    setCurrentRlsServiceRole('platform_admin')
    const { id, status, expectedStatus, note } = ctx.body as z.infer<typeof feedbackUpdateSchema>
    const result = await db.transaction(async client => {
      const updated = await client.query<{ id: string }>(`UPDATE feedback SET status = $2, resolution_note = $3,
        resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END,
        resolved_by = CASE WHEN $2 = 'resolved' THEN $4::uuid ELSE NULL END
        WHERE id = $1 AND status = $5 RETURNING id`, [id, status, note, ctx.userId, expectedStatus])
      if (!updated.rows[0]) return false
      await logAuditEvent({ userId: ctx.userId, action: 'feedback.status.changed', resourceType: 'feedback', resourceId: id,
        details: { previousStatus: expectedStatus, status, note }, timestamp: new Date() }, client)
      return true
    })
    return result ? apiSuccess({ id, status }) : apiSuccess({ error: 'This feedback changed or no longer exists. Refresh and try again.' }, 409)
  },
)
