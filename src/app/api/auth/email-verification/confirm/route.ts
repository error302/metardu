export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db, setCurrentUserId } from '@/lib/db'
import { verifyEmailVerificationToken } from '@/lib/auth/emailVerification'

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null)
  const token = body && typeof body === 'object' && 'token' in body && typeof body.token === 'string'
    ? body.token
    : ''
  const payload = verifyEmailVerificationToken(token)
  if (!payload) return NextResponse.json({ error: 'This verification link is invalid or has expired.' }, { status: 400 })

  setCurrentUserId(payload.sub)
  const result = await db.query<{ id: string }>(
    `UPDATE users
       SET email_verified = TRUE, updated_at = NOW()
     WHERE id = $1 AND email = $2
     RETURNING id`,
    [payload.sub, payload.email],
  )
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'This verification link no longer matches your account.' }, { status: 400 })
  }

  return NextResponse.json({ verified: true })
}
