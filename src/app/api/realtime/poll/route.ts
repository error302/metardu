import { NextResponse } from 'next/server'
import db from '@/lib/db'

// Only allow specific tables to be queried for security
const ALLOWED_TABLES = [
  'projects',
  'project_fieldbook_entries',
  'survey_points',
  'signatures',
  'audit_logs'
]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table')
  const projectId = searchParams.get('projectId')

  if (!table || !projectId) {
    return NextResponse.json({ error: 'Missing table or projectId' }, { status: 400 })
  }

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(
      `SELECT * FROM ${table} WHERE project_id = $1 ORDER BY updated_at DESC`,
      [projectId]
    )

    return NextResponse.json({ data: rows, error: null })
  } catch (err: any) {
    return NextResponse.json({ data: [], error: err.message }, { status: 500 })
  }
}
