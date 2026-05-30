import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/payments
 *
 * Returns paginated payment records and summary stats.
 * Requires auth + admin role.
 */
export const GET = apiHandler(
  { auth: true, roles: ['super_admin', 'admin', 'org_admin'] },
  async (req, _ctx) => {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)))
    const offset = (page - 1) * limit

    // ── Fetch payments with user info ──
    const [paymentsRes, countRes] = await Promise.all([
      db.query(
        `SELECT ph.id, ph.user_id, u.email AS user_email,
                COALESCE(u.full_name, SPLIT_PART(u.email, '@', 1)) AS user_name,
                ph.amount, ph.currency, ph.status, ph.payment_method AS method, ph.plan_id, ph.created_at
         FROM payment_history ph
         LEFT JOIN users u ON u.id = ph.user_id
         ORDER BY ph.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      db.query('SELECT COUNT(*)::int AS count FROM payment_history'),
    ])

    const payments = paymentsRes.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      amount: parseFloat(row.amount) || 0,
      currency: row.currency || 'KES',
      status: row.status || 'pending',
      method: row.method || 'unknown',
      planId: row.plan_id || 'free',
      createdAt: row.created_at,
    }))

    const total = countRes.rows[0]?.count ?? 0
    const totalPages = Math.ceil(total / limit)

    // ── Summary stats ──
    const [totalRevenueRes, thisMonthRes, pendingRes] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'`,
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
           AND created_at >= date_trunc('month', CURRENT_DATE)`,
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'pending'`,
      ),
    ])

    const summary = {
      totalRevenue: totalRevenueRes.rows[0]?.total ?? 0,
      thisMonth: thisMonthRes.rows[0]?.total ?? 0,
      pendingPayouts: pendingRes.rows[0]?.total ?? 0,
    }

    return apiSuccess({
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      summary,
    })
  },
)
