import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import db from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

const updateSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const identifier = `${user.id}:${getClientIdentifier(req)}`
    const { allowed } = await rateLimit(`update-password:${identifier}`, 10, 15 * 60 * 1000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, user.id]
    )

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch (err) {
    console.error('[update-password] Error:', err)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}
