import { db, setCurrentUserId } from '@/lib/db'
import { sendTemplatedEmail } from '@/lib/email-templates'

export async function activateVerifiedTrial(reader: Pick<typeof db, 'query'> = db) {
  const { rows } = await reader.query<{ trial_ends_at: Date | null }>(
    'SELECT public.metardu_activate_verified_trial() AS trial_ends_at',
  )
  return rows[0]?.trial_ends_at?.toISOString() ?? null
}

export async function sendTrialWelcome(account: { id: string; email: string; full_name: string | null }, trialEndsAt: string | null) {
  if (!trialEndsAt) return null
  return sendTemplatedEmail('welcome', {
    to: account.email,
    name: account.full_name || '',
    trialEndsAt,
  }, { idempotencyKey: `welcome:${account.id}` }).then(result => result.success).catch(() => false)
}

export async function activateTrialForVerifiedSignIn(account: { id: string; email: string; name: string }) {
  setCurrentUserId(account.id)
  const trialEndsAt = await activateVerifiedTrial()
  await sendTrialWelcome({ ...account, full_name: account.name }, trialEndsAt)
}
