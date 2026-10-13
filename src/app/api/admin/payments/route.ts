import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { PLATFORM_ADMIN_API_ROLES } from '@/lib/auth/rbac'
import { normalizePaymentCurrency, type PaymentCurrencyTotal } from '@/lib/admin/paymentCurrency'

export const dynamic = 'force-dynamic'

// ─── DB Row Interfaces ───────────────────────────────────────────────────
interface PaymentRow {
  id: string
  user_id: string
  user_email: string
  user_name: string
  amount: string
  currency: string | null
  status: string | null
  method: string | null
  plan_id: string | null
  created_at: Date | string
}

interface CountRow {
  count: number
}

interface CurrencyTotalRow {
  currency: string | null
  total: number | string
}

function mapCurrencyTotals(rows: CurrencyTotalRow[]): PaymentCurrencyTotal[] {
  return rows.map((row) => {
    const total = Number(row.total)
    return {
      currency: normalizePaymentCurrency(row.currency),
      total: Number.isFinite(total) ? total : 0,
    }
  })
}

/**
 * GET /api/admin/payments
 *
 * Returns paginated payment records and summary stats.
 * Requires auth + admin role.
 */
export const GET = apiHandler(
  { auth: true, roles: PLATFORM_ADMIN_API_ROLES, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, _ctx) => {
    setCurrentRlsServiceRole('platform_admin')
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)))
    const offset = (page - 1) * limit

    // ── Fetch payments with user info ──
    const [paymentsRes, countRes] = await Promise.all([
      db.query<PaymentRow>(
        `SELECT ph.id, ph.user_id, u.email AS user_email,
                COALESCE(u.full_name, SPLIT_PART(u.email, '@', 1)) AS user_name,
                ph.amount, ph.currency, ph.status, ph.payment_method AS method, ph.plan_id, ph.created_at
         FROM payment_history ph
         LEFT JOIN users u ON u.id = ph.user_id
         ORDER BY ph.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      db.query<CountRow>('SELECT COUNT(*)::int AS count FROM payment_history'),
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
    const [totalRevenueRes, thisMonthRes] = await Promise.all([
      db.query<CurrencyTotalRow>(
        `SELECT COALESCE(NULLIF(UPPER(currency), ''), 'KES') AS currency,
                COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
         GROUP BY COALESCE(NULLIF(UPPER(currency), ''), 'KES')
         ORDER BY currency`,
      ),
      db.query<CurrencyTotalRow>(
        `SELECT COALESCE(NULLIF(UPPER(currency), ''), 'KES') AS currency,
                COALESCE(SUM(amount), 0)::float AS total
         FROM payment_history
         WHERE status = 'completed'
           AND created_at >= date_trunc('month', CURRENT_DATE)
         GROUP BY COALESCE(NULLIF(UPPER(currency), ''), 'KES')
         ORDER BY currency`,
      ),
    ])

    const summary = {
      totalRevenueByCurrency: mapCurrencyTotals(totalRevenueRes.rows),
      thisMonthByCurrency: mapCurrencyTotals(thisMonthRes.rows),
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
