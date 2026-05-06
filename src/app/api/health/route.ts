import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const dbOk = (await db.query('SELECT 1 as ok')).rows[0].ok === 1

    return NextResponse.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    })
  } catch (err: any) {
    return NextResponse.json({
      status: 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'error: ' + err.message,
    }, { status: 503 })
  }
}