import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'

// Only allow specific tables to be queried, and require auth
const ALLOWED_TABLES = [
  'projects',
  'project_fieldbook_entries',
  'survey_points',
]

export const GET = apiHandler({ auth: true }, async (request, ctx) => {
  const table = request.nextUrl.searchParams.get('table')
  const projectId = request.nextUrl.searchParams.get('projectId')

  if (!table || !projectId) {
    return NextResponse.json({ error: 'Missing table or projectId' }, { status: 400 })
  }

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const { rows } = await db.query(
    `SELECT * FROM ${table} WHERE project_id = $1 ORDER BY updated_at DESC NULLS LAST`,
    [projectId]
  )

  return NextResponse.json({ data: rows, error: null })
})
