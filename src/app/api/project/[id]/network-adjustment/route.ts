import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'

export const dynamic = 'force-dynamic'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params

  // IDOR protection — verify project ownership before allowing overwrite
  const ownership = await requireProjectOwnership(id, ctx.userId)
  if (!ownership.ok) return ownership.error!

  const body = ctx.body as Record<string, unknown>

  await db.query(
    `INSERT INTO network_adjustments (
      project_id, stations, observations, adjusted_stations, summary, status, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (project_id) DO UPDATE SET
      stations = EXCLUDED.stations,
      observations = EXCLUDED.observations,
      adjusted_stations = EXCLUDED.adjusted_stations,
      summary = EXCLUDED.summary,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      JSON.stringify(body.stations),
      JSON.stringify(body.observations),
      JSON.stringify(body.adjusted_stations),
      JSON.stringify(body.summary),
      body.status,
      new Date().toISOString()
    ]
  )

  return NextResponse.json({ ok: true })
})

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params

  // IDOR protection — verify project ownership before returning data
  const ownership = await requireProjectOwnership(id, ctx.userId)
  if (!ownership.ok) return ownership.error!

  const res = await db.query(
    'SELECT * FROM network_adjustments WHERE project_id = $1',
    [id]
  )

  return NextResponse.json({ data: res.rows[0] ?? null })
})
