import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { EngineeringSubtype } from '@/lib/engine/engineering'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const { rows } = await db.query(
      'SELECT * FROM engineering_survey_data WHERE project_id = $1 LIMIT 1',
      [projectId]
    )

    if (rows.length === 0) {
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({ data: rows[0] })
  } catch (error) {
    console.error('Engineering data GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, subtype, data } = body as {
      projectId: string
      subtype: EngineeringSubtype
      data: Record<string, unknown>
    }

    if (!projectId || !subtype || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { rows } = await db.query(
      `INSERT INTO engineering_survey_data (project_id, subtype, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE SET subtype = EXCLUDED.subtype, data = EXCLUDED.data
       RETURNING *`,
      [projectId, subtype, JSON.stringify(data)]
    )

    return NextResponse.json({ data: rows[0] })
  } catch (error) {
    console.error('Engineering data POST error:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
}