import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/dashboard
 *
 * Returns platform-wide stats for the admin dashboard.
 * Requires auth + admin role.
 */
export const GET = apiHandler(
  { auth: true, roles: ['super_admin', 'admin', 'org_admin'] },
  async (req, ctx) => {
    const startTime = Date.now()

    // ── User stats ──
    const [totalUsersRes, newUsersRes, activeUsersRes] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM users'),
      db.query(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      ),
      db.query(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE updated_at >= NOW() - INTERVAL '30 days'`,
      ),
    ])

    const totalUsers = totalUsersRes.rows[0]?.count ?? 0
    const newUsersThisMonth = newUsersRes.rows[0]?.count ?? 0
    const activeUsers = activeUsersRes.rows[0]?.count ?? 0

    // ── Project stats ──
    const [totalProjectsRes, projectsByStatusRes] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM projects'),
      db.query(
        `SELECT status, COUNT(*)::int AS count FROM projects GROUP BY status`,
      ),
    ])

    const totalProjects = totalProjectsRes.rows[0]?.count ?? 0
    const projectsByStatus: Record<string, number> = {}
    for (const row of projectsByStatusRes.rows) {
      projectsByStatus[row.status || 'unknown'] = row.count
    }

    // ── Parcel & beacon counts ──
    const [totalParcelsRes, totalBeaconsRes] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM parcels'),
      db.query('SELECT COUNT(*)::int AS count FROM beacons'),
    ])

    const totalParcels = totalParcelsRes.rows[0]?.count ?? 0
    const totalBeacons = totalBeaconsRes.rows[0]?.count ?? 0

    // ── Revenue stats ──
    const [totalRevenueRes, revenueByMonthRes] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total FROM payment_history WHERE status = 'completed'`,
      ),
      db.query(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
         GROUP BY TO_CHAR(created_at, 'YYYY-MM')
         ORDER BY month DESC
         LIMIT 12`,
      ),
    ])

    const totalRevenue = totalRevenueRes.rows[0]?.total ?? 0
    const revenueByMonth = revenueByMonthRes.rows.map((row) => ({
      month: row.month,
      total: row.total,
    }))

    // ── Recent signups (last 10) ──
    const recentSignupsRes = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at,
              us.plan_id
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
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

    // ── System health ──
    let dbStatus = 'healthy'
    let dbLatencyMs = 0
    try {
      const healthStart = Date.now()
      await db.query('SELECT 1')
      dbLatencyMs = Date.now() - healthStart
    } catch {
      dbStatus = 'unhealthy'
    }

    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()

    const responseTime = Date.now() - startTime

    return apiSuccess({
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
      },
      recentSignups,
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
