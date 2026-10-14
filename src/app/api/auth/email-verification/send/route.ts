export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, setCurrentUserId } from '@/lib/db'
import { createEmailVerificationToken } from '@/lib/auth/emailVerification'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { rateLimit } from '@/lib/security/rateLimit'
import { getPublicAppUrl } from '@/lib/site'

interface VerificationAccountRow {
  email: string
  full_name: string | null
  email_verified: boolean
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    const email = session?.user?.email
    if (!userId || !email) return NextResponse.json({ error: 'Sign in to request email verification.' }, { status: 401 })

    const limit = await rateLimit(`email-verification:${userId}`, 3, 60 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'Please wait before requesting another verification email.' }, { status: 429 })

    setCurrentUserId(String(userId))
    const { rows } = await db.query<VerificationAccountRow>(
      'SELECT email, full_name, email_verified FROM users WHERE id = $1 LIMIT 1',
      [userId],
    )
    const account = rows[0]
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
    if (account.email_verified) return NextResponse.json({ verified: true, sent: false })

    const token = createEmailVerificationToken(String(userId), account.email)
    const verifyUrl = new URL('/email/verify', getPublicAppUrl())
    verifyUrl.searchParams.set('token', token)
    const result = await sendTemplatedEmail('emailVerification', {
      to: account.email,
      name: account.full_name || session.user.name || '',
      verifyUrl: verifyUrl.toString(),
    })
    if (!result.success) {
      return NextResponse.json({ error: 'METARDU could not send the verification email. Please try again later.' }, { status: 503 })
    }
    return NextResponse.json({ verified: false, sent: true })
  } catch {
    return NextResponse.json({ error: 'METARDU could not send the verification email. Please try again later.' }, { status: 503 })
  }
}
