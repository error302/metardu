import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess, checkOptimisticLock } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const verifyIskSchema = z.object({
  verified: z.boolean(),
  // Optimistic locking: frontend must send the updated_at value it last read
  updated_at: z.string(),
})

/**
 * PATCH /api/admin/users/[userId]/verify-isk
 *
 * Approve or reject an ISK verification request.
 * Requires auth + admin or super_admin role.
 *
 * Body:
 *   verified   (boolean, required) — true to approve, false to reject
 *   updated_at (string, required)  — optimistic lock timestamp
 */
export const PATCH = apiHandler(
  { auth: true, roles: ['super_admin', 'admin', 'org_admin'], optimisticLock: true, schema: verifyIskSchema, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const userId = ctx.params?.userId
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing user ID' },
        { status: 400 },
      )
    }

    const payload = ctx.body as z.infer<typeof verifyIskSchema>

    // Fetch current row for optimistic lock check
    const { rows } = await db.query(
      'SELECT id, updated_at FROM users WHERE id = $1',
      [userId]
    )

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Optimistic lock check
    const conflict = checkOptimisticLock(payload as unknown as Record<string, unknown>, rows[0])
    if (conflict) return conflict

    if (payload.verified) {
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

    return apiSuccess({ userId, verified: payload.verified })
  },
)
