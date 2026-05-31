import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import type { EngineeringSubtype } from '@/lib/engine/engineering'

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
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
})

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { projectId, subtype, data } = ctx.body as {
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
})
