import { db, setCurrentUserId } from '@/lib/db'
import { createEmailVerificationToken } from '@/lib/auth/emailVerification'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { getPublicAppUrl } from '@/lib/site'
import { logger } from '@/lib/logger'
import { activateVerifiedTrial, sendTrialWelcome } from '@/lib/auth/trialActivation'

/** Called only after account creation or an authenticated onboarding request. */
export async function completeAccountOnboarding(userId: string) {
  setCurrentUserId(userId)
  const accountResult = await db.query<{ email: string; full_name: string | null; email_verified: boolean }>(
    'SELECT email, full_name, email_verified FROM users WHERE id = $1 LIMIT 1', [userId],
  )
  const account = accountResult.rows[0]
  if (!account) throw new Error('Onboarding account not found')
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
  const trialEndsAt = account.email_verified ? await activateVerifiedTrial() : null
  const [verificationEmailSent, welcomeEmailSent] = await Promise.all([
    verificationDelivery(), sendTrialWelcome({ id: userId, ...account }, trialEndsAt),
  ])
  if (verificationEmailSent === false || welcomeEmailSent === false) {
    logger.warn('[onboarding] An account email was not accepted by the email provider.', { userId })
  }
  return { verificationEmailSent, welcomeEmailSent }
}
