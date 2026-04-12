import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { env } from '@/lib/env'

let pool: Pool | null = null
function getPool(): Pool {
  if (!pool) {
    if (env.DATABASE_URL) {
      pool = new Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 3000 })
    } else if (env.DB_HOST && env.DB_NAME && env.DB_USER) {
      pool = new Pool({
        host: env.DB_HOST, port: env.DB_PORT ?? 5432,
        database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
        max: 2, connectionTimeoutMillis: 3000,
      })
    } else {
      throw new Error('Database not configured')
    }
  }
  return pool
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, 'ok' | 'error'> = {}

  // Database check
  try {
    const p = getPool()
    await p.query('SELECT 1')
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  const allOk = Object.values(checks).every(v => v === 'ok')

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    latency_ms: Date.now() - start,
    version: process.env.npm_package_version ?? '1.0.1',
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 })
}
