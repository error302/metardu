import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

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
        params.id,
        JSON.stringify(body.stations),
        JSON.stringify(body.observations),
        JSON.stringify(body.adjusted_stations),
        JSON.stringify(body.summary),
        body.status,
        new Date().toISOString()
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[API/network-adjustment] POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await db.query(
      'SELECT * FROM network_adjustments WHERE project_id = $1',
      [params.id]
    )

    return NextResponse.json({ data: res.rows[0] ?? null })
  } catch (err: any) {
    console.error('[API/network-adjustment] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}