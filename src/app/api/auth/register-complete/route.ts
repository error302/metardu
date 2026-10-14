export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { completeAccountOnboarding } from '@/lib/auth/onboarding'
import { rateLimit } from '@/lib/security/rateLimit'
import { logger } from '@/lib/logger'

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const limit = await rateLimit(`onboarding:${session.user.id}`, 3, 60 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'Please wait before retrying onboarding.' }, { status: 429 })
    const result = await completeAccountOnboarding(String(session.user.id))
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logger.error('[register-complete] Onboarding failed.', { error })
    return NextResponse.json({ error: 'Account setup is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
