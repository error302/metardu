import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, 'ok' | 'error'> = {}

  // Database check
  try {
    await db.query('SELECT 1')
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