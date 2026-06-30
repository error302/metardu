export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { sendTemplatedEmail } from '@/lib/email-templates'
import db from '@/lib/db'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
})

function okResponse() {
  return NextResponse.json({
    success: true,
    message: 'If that email exists, a reset link has been sent.',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = forgotSchema.safeParse(body)
    if (!parsed.success) return okResponse()

    const email = parsed.data.email.toLowerCase().trim()
    const identifier = email || getClientIdentifier(req)
    const { allowed } = await rateLimit(`forgot:${identifier}`, 5, 15 * 60 * 1000)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const userRes = await db.query('SELECT id, email, full_name FROM users WHERE email = $1 LIMIT 1', [email])
    if (userRes.rows.length === 0) return okResponse()

    const user = userRes.rows[0] as { id: string; email: string; full_name: string | null }
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await db.query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    )
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt.toISOString()]
    )

    const result = await sendTemplatedEmail('passwordReset', {
      to: user.email,
      name: user.full_name ?? '',
      resetToken: token,
      expiresAt: expiresAt.toISOString(),
    })

    if (!result.success && result.error === 'Email service not configured') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
      const resetUrl = `${appUrl.replace(/\/+$/, '')}/auth/reset-password?token=${encodeURIComponent(token)}`
      console.warn('[forgot-password] SMTP not configured. Reset link:', resetUrl)
    }

    return okResponse()
  } catch (err) {
    console.error('[forgot-password] Error:', err)
    return okResponse()
  }
}
