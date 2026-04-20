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
    const { id: projectId } = params

    await db.query(
      `INSERT INTO hydro_surveys (
        project_id, sounding_data, water_level, chart_datum, survey_date, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id) DO UPDATE SET
        sounding_data = EXCLUDED.sounding_data,
        water_level = EXCLUDED.water_level,
        chart_datum = EXCLUDED.chart_datum,
        survey_date = EXCLUDED.survey_date,
        updated_at = EXCLUDED.updated_at`,
      [
        projectId,
        JSON.stringify(body.sounding_data || []),
        body.water_level || null,
        body.chart_datum || null,
        body.survey_date || new Date().toISOString(),
        new Date().toISOString()
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[API/hydro-survey] POST error:', err)
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
      'SELECT * FROM hydro_surveys WHERE project_id = $1',
      [params.id]
    )

    return NextResponse.json({ data: res.rows[0] ?? null })
  } catch (err: any) {
    console.error('[API/hydro-survey] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
