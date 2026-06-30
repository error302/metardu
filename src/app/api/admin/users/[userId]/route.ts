import { NextResponse } from 'next/server'
import { apiHandler, checkOptimisticLock } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/users/[userId]
 *
 * Update a user's profile fields with optimistic locking.
 * Requires auth + admin or super_admin role.
 *
 * Frontend MUST send `updated_at` in the request body — the value should be
 * the `updated_at` timestamp from the most recent GET/fetch of this user.
 * If the DB row's `updated_at` differs (another admin edited it), returns 409.
 *
 * Body fields are split across two tables:
 *   users table:             full_name, email
 *   surveyor_profiles table: firm_name, license_number, phone
 */
const patchUserProfileSchema = z.object({
  // users table fields
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  // surveyor_profiles table fields
  firm_name: z.string().nullable().optional(),
  license_number: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  // Optimistic locking: frontend must send the updated_at value it last read
  updated_at: z.string(),
})

export const PATCH = apiHandler(
  { auth: true, roles: ['super_admin', 'admin', 'org_admin'], optimisticLock: true, schema: patchUserProfileSchema, rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { userId } = ctx.params
    const body = ctx.body as z.infer<typeof patchUserProfileSchema>

    // Fetch current user row for optimistic lock check
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
    const conflict = checkOptimisticLock(body as unknown as Record<string, unknown>, rows[0])
    if (conflict) return conflict

    // Build dynamic UPDATE for users table
    const userFields: string[] = []
    const userValues: unknown[] = []
    let userParamIdx = 1

    const userAllowedFields: Record<string, string> = {
      full_name: 'full_name',
      email: 'email',
    }

    for (const [bodyKey, colName] of Object.entries(userAllowedFields)) {
      if (bodyKey in body && body[bodyKey as keyof typeof body] !== undefined) {
        userFields.push(`${colName} = $${userParamIdx++}`)
        userValues.push(body[bodyKey as keyof typeof body])
      }
    }

    // Build dynamic UPDATE for surveyor_profiles table
    const profileFields: string[] = []
    const profileValues: unknown[] = []
    let profileParamIdx = 1

    const profileAllowedFields: Record<string, string> = {
      firm_name: 'firm_name',
      license_number: 'license_number',
      phone: 'phone',
    }

    for (const [bodyKey, colName] of Object.entries(profileAllowedFields)) {
      if (bodyKey in body && body[bodyKey as keyof typeof body] !== undefined) {
        profileFields.push(`${colName} = $${profileParamIdx++}`)
        profileValues.push(body[bodyKey as keyof typeof body])
      }
    }

    if (userFields.length === 0 && profileFields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update', code: 'NO_FIELDS' },
        { status: 400 }
      )
    }

    // Update users table if there are user fields to update
    if (userFields.length > 0) {
      userFields.push(`updated_at = NOW()`)
      userValues.push(userId)
      await db.query(
        `UPDATE users SET ${userFields.join(', ')} WHERE id = $${userParamIdx}`,
        userValues
      )
    }

    // Update surveyor_profiles table if there are profile fields to update
    if (profileFields.length > 0) {
      profileFields.push(`updated_at = NOW()`)
      profileValues.push(userId)
      await db.query(
        `UPDATE surveyor_profiles SET ${profileFields.join(', ')} WHERE user_id = $${profileParamIdx}`,
        profileValues
      )
    }

    // Fetch and return the updated user
    const updated = await db.query(
      `SELECT u.id, u.email, u.full_name, u.updated_at,
              sp.firm_name, sp.license_number, sp.phone
       FROM users u
       LEFT JOIN surveyor_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    )

    return NextResponse.json({ data: updated.rows[0] })
  }
)
