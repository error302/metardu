import { NextRequest, NextResponse } from 'next/server'
import { createMarketingUnsubscribeToken } from '@/lib/auth/marketingUnsubscribe'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { sendTemplatedEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 100
const MAX_ATTEMPTS = 3

interface Candidate {
  user_id: string
  email: string
  full_name: string | null
}

function monthCampaignKey(now = new Date()): string {
  return `plan-nudge-${now.toISOString().slice(0, 7)}`
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.API_ADMIN_KEY
  if (!serviceKey || request.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (process.env.METARDU_MARKETING_EMAILS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Marketing email sending is disabled' }, { status: 403 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Resend is not configured for marketing email' }, { status: 503 })
  }
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!authSecret || authSecret.length < 32) {
    return NextResponse.json({ error: 'Marketing unsubscribe signing is not configured' }, { status: 503 })
  }

  setCurrentRlsServiceRole('billing_reconciliation')
  const campaignKey = monthCampaignKey()
  const candidates = await db.transaction(async (client) => {
    // A provider timeout can leave delivery state uncertain. Recover only
    // within Resend's idempotency window; older attempts need operator review.
    await client.query<never>(
      `UPDATE marketing_email_deliveries
       SET status = 'needs_review'
       WHERE status IN ('processing', 'failed')
         AND claimed_at < NOW() - interval '23 hours'`,
    )

    const { rows } = await client.query<Candidate>(
      `SELECT u.id::text AS user_id, u.email, u.full_name
       FROM users u
       JOIN profiles p ON p.id = u.id
       JOIN user_consents c ON c.user_id = u.id
         AND c.consent_type = 'marketing' AND c.granted = true
       WHERE u.email_verified = true
         AND u.email IS NOT NULL AND btrim(u.email) <> ''
         AND p.notification_preferences->'email'->>'marketing' = 'true'
         AND u.created_at <= NOW() - interval '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM user_subscriptions s
           WHERE s.user_id = u.id
             AND (s.status IN ('trial', 'past_due')
               OR (s.status = 'active' AND COALESCE(s.plan_id, 'free') <> 'free'))
         )
         AND NOT EXISTS (
           SELECT 1 FROM surveyor_profiles sp
           WHERE sp.user_id = u.id AND sp.is_suspended = true
         )
         AND NOT EXISTS (
           SELECT 1 FROM marketing_email_deliveries d
           WHERE d.user_id = u.id AND d.status = 'needs_review'
         )
         AND NOT EXISTS (
           SELECT 1 FROM marketing_email_deliveries d
           WHERE d.user_id = u.id AND d.status IN ('processing', 'failed')
             AND d.campaign_key <> $1
         )
         AND NOT EXISTS (
           SELECT 1 FROM marketing_email_deliveries d
           WHERE d.user_id = u.id AND d.status = 'sent'
             AND d.sent_at > NOW() - interval '30 days'
         )
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT $2
       FOR UPDATE OF u SKIP LOCKED`,
      [campaignKey, MAX_BATCH],
    )
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.user_id)
    const { rows: claimed } = await client.query<{ user_id: string }>(
      `INSERT INTO marketing_email_deliveries
         (user_id, campaign_key, status, attempt_count, claimed_at)
       SELECT candidate.user_id, $1, 'processing', 1, NOW()
       FROM unnest($2::uuid[]) AS candidate(user_id)
       ON CONFLICT (user_id, campaign_key)
       DO UPDATE SET status = 'processing',
                     attempt_count = marketing_email_deliveries.attempt_count + 1,
                     claimed_at = NOW()
       WHERE marketing_email_deliveries.status IN ('failed', 'processing')
         AND marketing_email_deliveries.attempt_count < $3
         AND marketing_email_deliveries.claimed_at >= NOW() - interval '23 hours'
         AND (marketing_email_deliveries.status = 'failed'
           OR marketing_email_deliveries.claimed_at < NOW() - interval '10 minutes')
       RETURNING user_id::text`,
      [campaignKey, ids, MAX_ATTEMPTS],
    )
    const claimedIds = new Set(claimed.map((row) => row.user_id))
    return rows.filter((row) => claimedIds.has(row.user_id))
  })

  let sent = 0
  let failed = 0
  let skipped = 0
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space'
  for (const row of candidates) {
    const eligibility = await db.query<{ eligible: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM users u
         JOIN profiles p ON p.id = u.id
         JOIN user_consents c ON c.user_id = u.id
           AND c.consent_type = 'marketing' AND c.granted = true
         WHERE u.id = $1 AND u.email_verified = true
           AND p.notification_preferences->'email'->>'marketing' = 'true'
           AND NOT EXISTS (
             SELECT 1 FROM user_subscriptions s
             WHERE s.user_id = u.id
               AND (s.status IN ('trial', 'past_due')
                 OR (s.status = 'active' AND COALESCE(s.plan_id, 'free') <> 'free'))
           )
           AND NOT EXISTS (
             SELECT 1 FROM surveyor_profiles sp
             WHERE sp.user_id = u.id AND sp.is_suspended = true
           )
       ) AS eligible`,
      [row.user_id],
    )
    if (!eligibility.rows[0]?.eligible) {
      await db.query<never>(
        `UPDATE marketing_email_deliveries
         SET status = 'skipped'
         WHERE user_id = $1 AND campaign_key = $2 AND status = 'processing'`,
        [row.user_id, campaignKey],
      )
      skipped += 1
      continue
    }

    const token = createMarketingUnsubscribeToken(row.user_id, row.email)
    const unsubscribeUrl = new URL('/api/email/marketing-unsubscribe', appUrl)
    unsubscribeUrl.searchParams.set('token', token)
    const result = await sendTemplatedEmail('planReminder', {
      to: row.email,
      name: row.full_name || '',
      unsubscribeUrl: unsubscribeUrl.toString(),
    }, { idempotencyKey: `${campaignKey}/${row.user_id}` })

    await db.query<never>(
      `UPDATE marketing_email_deliveries
       SET status = $3, sent_at = CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END
       WHERE user_id = $1 AND campaign_key = $2 AND status = 'processing'`,
      [row.user_id, campaignKey, result.success ? 'sent' : 'failed'],
    )
    if (result.success) sent += 1
    else failed += 1
  }

  return NextResponse.json({ success: failed === 0, campaignKey, eligible: candidates.length, sent, failed, skipped })
}
