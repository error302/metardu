import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { getVaultStats } from '@/lib/parcelVault'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parcel-vault/stats
 *
 * Returns aggregate parcel vault counts (total, shared, fresh, verify, stale).
 * Public endpoint — only returns aggregate numbers, no PII or parcel data.
 *
 * Rate-limited at the middleware level (default 'api' category: 120 req/min per IP).
 * The explicit apiHandler wrapper below adds per-route rate-limit metadata
 * for observability and ensures consistent error handling.
 */
export const GET = apiHandler(
  { auth: false, rateLimit: { max: 30, windowMs: 60_000 } },
  async () => {
    const stats = await getVaultStats()
    return NextResponse.json(stats)
  }
)
