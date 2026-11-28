export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db, setCurrentUserId } from '@/lib/db'
import { verifyEmailVerificationToken } from '@/lib/auth/emailVerification'
import { activateVerifiedTrial, sendTrialWelcome } from '@/lib/auth/trialActivation'

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null)
  const token = body && typeof body === 'object' && 'token' in body && typeof body.token === 'string'
    ? body.token
    : ''
  const payload = verifyEmailVerificationToken(token)
  if (!payload) return NextResponse.json({ error: 'This verification link is invalid or has expired.' }, { status: 400 })

  try {
    setCurrentUserId(payload.sub)
    const account = await db.transaction(async client => {
      const result = await client.query<{ id: string; full_name: string | null }>(
        `UPDATE users SET email_verified = TRUE, updated_at = NOW()
         WHERE id = $1 AND email = $2 RETURNING id, full_name`,
        [payload.sub, payload.email],
      )
      const user = result.rows[0]
      if (!user) return null
      return { ...user, email: payload.email, trialEndsAt: await activateVerifiedTrial(client) }
    })
    if (!account) {
      return NextResponse.json({ error: 'This verification link no longer matches your account.' }, { status: 400 })
    }

    await sendTrialWelcome(account, account.trialEndsAt)
    return NextResponse.json({ verified: true, trialStarted: account.trialEndsAt !== null })
  } catch {
    return NextResponse.json({ error: 'Email verification is temporarily unavailable. Please open this link again later.' }, { status: 503 })
  }
}
