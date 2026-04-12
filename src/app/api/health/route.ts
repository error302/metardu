import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { Pool } = require('pg')
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
    })
    const dbOk = (await pool.query('SELECT 1 as ok')).rows[0].ok === 1
    await pool.end()

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
