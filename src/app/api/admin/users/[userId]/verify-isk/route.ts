import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/users/[userId]/verify-isk
 *
 * Approve or reject an ISK verification request.
 * Requires auth + admin or super_admin role.
 *
 * Body:
 *   verified  (boolean, required) — true to approve, false to reject
 */
export const PATCH = apiHandler(
  { auth: true, roles: ['super_admin', 'admin', 'org_admin'] },
  async (req, ctx) => {
    const userId = ctx.params?.userId
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user ID' },
        { status: 400 },
      )
    }

    const payload = ctx.body as Record<string, unknown>
    const verified = payload.verified === true

    if (verified) {
      await db.query(
        `UPDATE users SET verified_isk = true, updated_at = NOW() WHERE id = $1`,
        [userId],
      )
    } else {
      // Reject: clear the ISK number so they can resubmit
      await db.query(
        `UPDATE users SET isk_number = NULL, updated_at = NOW() WHERE id = $1`,
        [userId],
      )
    }

    return apiSuccess({ userId, verified })
  },
)
