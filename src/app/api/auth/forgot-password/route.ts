import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const resetUrl = `${appUrl.replace(/\/+$/, '')}/auth/reset-password?token=${encodeURIComponent(token)}`
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Reset your METARDU password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color:#111;">Reset your password</h2>
          <p>Hi ${user.full_name || 'there'},</p>
          <p>We received a request to reset your METARDU password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#E8841A;color:#111;text-decoration:none;border-radius:6px;font-weight:700;">
              Reset Password
            </a>
          </p>
          <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    })
    
    if (!emailResult.success && emailResult.error === 'Email service not configured') {
      console.warn('[forgot-password] SMTP not configured. Reset link:', resetUrl)
    }

    return okResponse()
  } catch (err) {
    console.error('[forgot-password] Error:', err)
    return okResponse()
  }
}
