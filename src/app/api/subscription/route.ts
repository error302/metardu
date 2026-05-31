import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import type { PlanId } from '@/lib/subscription/catalog'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription
 *
 * Returns the current user's subscription info.
 * Uses the server-side subscriptionEngine which correctly
 * detects admin emails and grants enterprise access.
 *
 * This replaces direct client-side DB reads of user_subscriptions
 * which missed the admin bypass logic.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ plan: 'free', status: 'active' }, { status: 401 })
    }

    const userId = session.user.id
    const email = session.user.email ?? undefined

    const sub = await getSubscription(userId, email)

    if (!sub) {
      // No subscription row — default to free tier (admin check already done inside getSubscription)
      return NextResponse.json({
        plan: 'free' as PlanId,
        status: 'active',
        isUnlimitedProjects: false,
        isUnlimitedPoints: false,
        maxTeamMembers: 1,
        isAdmin: false,
      })
    }

    return NextResponse.json({
      plan: sub.plan,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      paymentMethod: sub.paymentMethod,
      currency: sub.currency,
      isUnlimitedProjects: sub.isUnlimitedProjects,
      isUnlimitedPoints: sub.isUnlimitedPoints,
      maxTeamMembers: sub.maxTeamMembers,
      isAdmin: sub.paymentMethod === 'admin',
    })
  } catch (error) {
    console.error('[/api/subscription] Error:', error)
    return NextResponse.json({ plan: 'free', status: 'active' }, { status: 500 })
  }
}
