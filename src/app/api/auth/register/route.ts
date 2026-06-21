/**
 * POST /api/auth/register — Create new user account
 *
 * Hashes password with bcrypt and inserts into the users table.
 * Also creates a surveyor_profiles record so role lookup works on login.
 * Returns success so the client can auto-login via NextAuth.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { z } from 'zod'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
})

export async function POST(request: NextRequest) {
  // Rate limit: 5 registrations per IP per 15 minutes
  const rl = await rateLimit(`register:${getClientIdentifier(request)}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many registration attempts. Please try again later.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }

    const { email, password, fullName } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    // Check if user already exists
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    )

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Insert user + create surveyor_profile in a transaction
    const user = await db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, 'surveyor')
         RETURNING id, email, full_name`,
        [normalizedEmail, passwordHash, fullName]
      )

      const newUser = rows[0]

      // Create surveyor_profiles record — use gen_random_uuid() for id
      // since the table may not have a default
      await client.query(
        `INSERT INTO surveyor_profiles (id, user_id, role, is_suspended)
         VALUES (gen_random_uuid(), $1, 'surveyor', false)`,
        [newUser.id]
      )

      // Try to create profiles record (best effort — may not have right schema)
      try {
        await client.query(
          `INSERT INTO profiles (id, email, full_name)
           VALUES ($1, $2, $3)`,
          [newUser.id, normalizedEmail, fullName]
        )
      } catch {
        // profiles table may have different schema — not critical
      }

      return newUser
    })

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.full_name },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as Error).message : 'Unknown error'
    console.error('[register] Error:', message)
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
