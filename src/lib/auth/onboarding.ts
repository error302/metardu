import { db, setCurrentUserId } from '@/lib/db'
import { createEmailVerificationToken } from '@/lib/auth/emailVerification'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { getPublicAppUrl } from '@/lib/site'
import { logger } from '@/lib/logger'

/** Called only after account creation or an authenticated onboarding request. */
export async function completeAccountOnboarding(userId: string) {
  setCurrentUserId(userId)
  const accountResult = await db.query<{ email: string; full_name: string | null; email_verified: boolean }>(
    'SELECT email, full_name, email_verified FROM users WHERE id = $1 LIMIT 1', [userId],
  )
  const account = accountResult.rows[0]
  if (!account) throw new Error('Onboarding account not found')
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const subscription = await db.query<{ trial_ends_at: string }>(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
     VALUES ($1, 'pro', 'trial', $2, $3, $2)
     ON CONFLICT (user_id) DO NOTHING RETURNING trial_ends_at`,
    [userId, trialEnd, now.toISOString()],
  )

  // Both deliveries share the request, but neither waits for the other provider call.
  const verificationDelivery = async (): Promise<boolean | null> => {
    if (account.email_verified) return null
    try {
      const url = new URL('/email/verify', getPublicAppUrl())
      url.searchParams.set('token', createEmailVerificationToken(userId, account.email))
      return (await sendTemplatedEmail('emailVerification', {
        to: account.email, name: account.full_name || '', verifyUrl: url.toString(),
      })).success
    } catch {
      return false
    }
  }
  const welcomeDelivery = async (): Promise<boolean | null> => {
    if (subscription.rows.length === 0) return null
    try {
      return (await sendTemplatedEmail('welcome', {
        to: account.email, name: account.full_name || '', trialEndsAt: trialEnd,
      }, { idempotencyKey: `welcome:${userId}` })).success
    } catch {
      return false
    }
  }
  const [verificationEmailSent, welcomeEmailSent] = await Promise.all([verificationDelivery(), welcomeDelivery()])
  if (verificationEmailSent === false || welcomeEmailSent === false) {
    logger.warn('[onboarding] An account email was not accepted by the email provider.', { userId })
  }
  return { verificationEmailSent, welcomeEmailSent }
}
