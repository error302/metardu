import { db } from '@/lib/db'
import { syntheticAccountSql, type DashboardData } from './dashboardContract'

/** Read-only owner workload. Uses existing tables; no new migration or sender. */
export async function loadAdminOperations(): Promise<DashboardData['operations']> {
  const [accounts, payments, subscriptions, feedbackCount, renewals, feedback, announcements] = await Promise.all([
    db.query<{ accounts: number; synthetic_accounts: number; unverified: number }>(`SELECT
      COUNT(*) FILTER (WHERE NOT ${syntheticAccountSql})::int AS accounts,
      COUNT(*) FILTER (WHERE ${syntheticAccountSql})::int AS synthetic_accounts,
      COUNT(*) FILTER (WHERE NOT ${syntheticAccountSql} AND u.email_verified = false)::int AS unverified
      FROM users u`),
    db.query<{ pending: number; failed: number }>(`SELECT
      COUNT(*) FILTER (WHERE status = 'pending_review' AND payment_method = 'mpesa_till')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '30 days')::int AS failed
      FROM payment_history`),
    db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM user_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE NOT ${syntheticAccountSql} AND s.status IN ('active', 'trial')
      AND CASE WHEN s.status = 'trial' THEN s.trial_ends_at ELSE s.current_period_end END BETWEEN NOW() AND NOW() + INTERVAL '7 days'`),
    db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM feedback WHERE status IN ('open', 'in_progress')"),
    db.query<{ id: string; email: string; name: string; plan: string; status: string; expires_at: Date }>(`SELECT u.id, u.email,
      COALESCE(u.full_name, split_part(u.email, '@', 1)) AS name, s.plan_id AS plan, s.status,
      CASE WHEN s.status = 'trial' THEN s.trial_ends_at ELSE s.current_period_end END AS expires_at
      FROM user_subscriptions s JOIN users u ON u.id = s.user_id WHERE NOT ${syntheticAccountSql}
      AND s.status IN ('active', 'trial') AND CASE WHEN s.status = 'trial' THEN s.trial_ends_at ELSE s.current_period_end END
      BETWEEN NOW() AND NOW() + INTERVAL '7 days' ORDER BY expires_at ASC LIMIT 20`),
    db.query<{ id: string; type: string; message: string; email: string | null; status: string; created_at: Date; resolution_note: string | null }>(`SELECT id, type, message, email, status, created_at, resolution_note FROM feedback
      ORDER BY CASE WHEN status IN ('open', 'in_progress') THEN 0 ELSE 1 END, created_at DESC LIMIT 30`),
    db.query<{ id: string; title: string; body: string; target: string; created_at: Date }>('SELECT id, title, body, target, created_at FROM announcements ORDER BY created_at DESC LIMIT 10'),
  ])
  return {
    accounts: accounts.rows[0]?.accounts ?? 0, syntheticAccounts: accounts.rows[0]?.synthetic_accounts ?? 0,
    unverifiedEmails: accounts.rows[0]?.unverified ?? 0, pendingClaims: payments.rows[0]?.pending ?? 0,
    failedPayments30d: payments.rows[0]?.failed ?? 0, expiringSubscriptions7d: subscriptions.rows[0]?.count ?? 0,
    openFeedback: feedbackCount.rows[0]?.count ?? 0,
    renewals: renewals.rows.map(row => ({ id: row.id, email: row.email, name: row.name, plan: row.plan, status: row.status, expiresAt: new Date(row.expires_at).toISOString() })),
    feedback: feedback.rows.map(row => ({ id: row.id, type: row.type, message: row.message, email: row.email, status: row.status, createdAt: new Date(row.created_at).toISOString(), resolutionNote: row.resolution_note })),
    announcements: announcements.rows.map(row => ({ id: row.id, title: row.title, body: row.body, target: row.target, createdAt: new Date(row.created_at).toISOString() })),
  }
}
