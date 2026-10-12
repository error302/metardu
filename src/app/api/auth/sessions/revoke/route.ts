export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, setCurrentUserId } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getClientIdentifier, rateLimit } from '@/lib/security/rateLimit'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    setCurrentUserId(userId)

    const limit = await rateLimit(
      `revoke-sessions:${userId}:${getClientIdentifier(request)}`,
      5,
      15 * 60 * 1000,
    )
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const { rows } = await db.query<{ session_version: string | number }>(
      `UPDATE users
          SET session_version = session_version + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING session_version`,
      [userId],
    )
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('[revoke-sessions] Failed to revoke user sessions:', { error })
    return NextResponse.json({ error: 'Unable to revoke sessions right now' }, { status: 500 })
  }
}
