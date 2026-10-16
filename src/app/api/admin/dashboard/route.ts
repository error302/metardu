import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { buildRevenueDashboardMetrics, buildSubscriptionDashboardMetrics } from '@/lib/admin/dashboardMetrics'
import { loadAdminOperations } from '@/lib/admin/operations'
import { syntheticAccountSql } from '@/lib/admin/dashboardContract'
import { PLATFORM_ADMIN_API_ROLES } from '@/lib/auth/rbac'

interface CountRow {
  count: number
}

interface StatusCountRow {
  status: string | null
  count: number
}

interface TotalRow {
  total: number
}

interface MonthTotalRow {
  month: string
  total: number
}

interface CurrencyTotalRow extends TotalRow {
  currency: string
}

interface SignupRow {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string | Date
  plan_id: string | null
}

interface PlanCountRow {
  plan_id: string | null
  status: string
  count: number
}

interface IskQueueRow {
  id: string
  email: string
  full_name: string | null
  isk_number: string | null
  updated_at: Date | string
  created_at: string | Date
}

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/dashboard
 *
 * Returns platform-wide stats for the admin dashboard.
 * Requires auth + admin role.
 */
export const GET = apiHandler(
  { auth: true, roles: PLATFORM_ADMIN_API_ROLES, rateLimit: { max: 60, windowMs: 60000 } },
  async () => {
    setCurrentRlsServiceRole('platform_admin')
    const startTime = Date.now()

    // ── User stats ──
    const [totalUsersRes, newUsersRes, activeUsersRes] = await Promise.all([
      db.query<CountRow>('SELECT COUNT(*)::int AS count FROM users'),
      db.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      ),
      db.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE updated_at >= NOW() - INTERVAL '30 days'`,
      ),
    ])

    const totalUsers = totalUsersRes.rows[0]?.count ?? 0
    const newUsersThisMonth = newUsersRes.rows[0]?.count ?? 0
    const activeUsers = activeUsersRes.rows[0]?.count ?? 0

    // ── Project stats ──
    const [totalProjectsRes, projectsByStatusRes] = await Promise.all([
      db.query<CountRow>('SELECT COUNT(*)::int AS count FROM projects'),
      db.query<StatusCountRow>(
        `SELECT status, COUNT(*)::int AS count FROM projects GROUP BY status`,
      ),
    ])

    const totalProjects = totalProjectsRes.rows[0]?.count ?? 0
    const projectsByStatus: Record<string, number> = {}
    for (const row of projectsByStatusRes.rows) {
      projectsByStatus[row.status || 'unknown'] = row.count
    }

    // ── Parcel & beacon counts ──
    // AUDIT FIX (H-004, 2026-07-27): there is no `beacons` table — the schema
    // uses `public_beacons` and `rim_beacons`. Use UNION ALL so the count
    // reflects all beacons regardless of subtype.
    const [totalParcelsRes, totalBeaconsRes] = await Promise.all([
      db.query<CountRow>('SELECT COUNT(*)::int AS count FROM parcels'),
      db.query<CountRow>(
        'SELECT (SELECT COUNT(*) FROM public_beacons) + (SELECT COUNT(*) FROM rim_beacons) AS count'
      ),
    ])

    const totalParcels = totalParcelsRes.rows[0]?.count ?? 0
    const totalBeacons = totalBeaconsRes.rows[0]?.count ?? 0

    // ── Revenue stats ──
    const [revenueByCurrencyRes, revenueByMonthRes] = await Promise.all([
      db.query<CurrencyTotalRow>(
        `SELECT COALESCE(NULLIF(UPPER(currency), ''), 'KES') AS currency,
                COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
         GROUP BY COALESCE(NULLIF(UPPER(currency), ''), 'KES')
         ORDER BY currency`,
      ),
      db.query<MonthTotalRow>(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
           AND COALESCE(NULLIF(UPPER(currency), ''), 'KES') = 'KES'
         GROUP BY TO_CHAR(created_at, 'YYYY-MM')
         ORDER BY month DESC
         LIMIT 12`,
      ),
    ])

    const revenueMetrics = buildRevenueDashboardMetrics(revenueByCurrencyRes.rows)
    const revenueByCurrency = revenueMetrics.byCurrency
    const totalRevenue = revenueMetrics.kesTotal
    const revenueByMonth = revenueByMonthRes.rows.map((row) => ({
      month: row.month,
      total: row.total,
    }))

    // ── Recent signups (last 10) ──
    const recentSignupsRes = await db.query<SignupRow>(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at,
              us.plan_id
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       WHERE NOT ${syntheticAccountSql}
       ORDER BY u.created_at DESC
       LIMIT 10`,
    )

    const recentSignups = recentSignupsRes.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.full_name || row.email?.split('@')[0],
      role: row.role,
      plan: row.plan_id || 'free',
      createdAt: row.created_at,
    }))

    // ── ISK Verification Queue ──
    const iskPendingRes = await db.query<CountRow>(
      `SELECT COUNT(*)::int AS count FROM users WHERE verified_isk = false AND NULLIF(TRIM(isk_number), '') IS NOT NULL`,
    )
    const iskPendingCount = iskPendingRes.rows[0]?.count ?? 0

    // ── Subscription breakdown ──
    const subCountsRes = await db.query<PlanCountRow>(
      `SELECT plan_id, status, COUNT(*)::int AS count
       FROM user_subscriptions
       WHERE (status = 'active' AND (current_period_end IS NULL OR current_period_end >= NOW()))
          OR (status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at >= NOW()))
       GROUP BY plan_id, status`,
    )
    const subscriptionMetrics = buildSubscriptionDashboardMetrics(subCountsRes.rows)

    // ── Submissions this month ──
    const submissionsRes = await db.query<CountRow>(
      `SELECT COUNT(*)::int AS count FROM submissions WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
    )
    const submissionsThisMonth = submissionsRes.rows[0]?.count ?? 0

    // ── ISK pending users (for queue display) ──
    const iskQueueRes = await db.query<IskQueueRow>(
      `SELECT id, email, full_name, isk_number, created_at, updated_at::text AS updated_at
       FROM users
       WHERE verified_isk = false AND NULLIF(TRIM(isk_number), '') IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    const iskQueue = iskQueueRes.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.full_name || row.email?.split('@')[0],
      iskNumber: row.isk_number,
      submittedAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    // ── System health ──
    let dbStatus = 'healthy'
    let dbLatencyMs = 0
    try {
      const healthStart = Date.now()
      await db.query<never>('SELECT 1')
      dbLatencyMs = Date.now() - healthStart
    } catch {
      dbStatus = 'unhealthy'
    }

    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()

    const operations = await loadAdminOperations()
    const responseTime = Date.now() - startTime

    return apiSuccess({
      operations,
      generatedAt: new Date().toISOString(),
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        active: activeUsers,
      },
      projects: {
        total: totalProjects,
        byStatus: projectsByStatus,
      },
      parcels: totalParcels,
      beacons: totalBeacons,
      revenue: {
        total: totalRevenue,
        byMonth: revenueByMonth,
        byCurrency: revenueByCurrency,
      },
      recentSignups,
      iskPendingCount,
      iskQueue,
      activeSubscriptions: subscriptionMetrics.activeByPlan,
      trialSubscriptions: subscriptionMetrics.trialCount,
      submissionsThisMonth,
      system: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        uptime: Math.floor(uptime),
        memory: {
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        responseTimeMs: responseTime,
      },
    })
  },
)
