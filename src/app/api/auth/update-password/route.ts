import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

const updateSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as { id?: string; email?: string | null; name?: string | null } | undefined
    const userId = sessionUser?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }

    const identifier = `${userId}:${getClientIdentifier(req)}`
    const { allowed } = await rateLimit(`update-password:${identifier}`, 10, 15 * 60 * 1000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)
    await db.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, userId]
    )

    return NextResponse.json({
      success: true,
      user: { id: userId, email: sessionUser?.email ?? null, name: sessionUser?.name ?? null },
    })
  } catch (err) {
    console.error('[update-password] Error:', err)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }
}
