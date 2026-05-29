import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const { id } = ctx.params

  const { rows } = await db.query(
    `SELECT * FROM project_fieldbook_entries
     WHERE project_id = $1
     ORDER BY row_index ASC`,
    [id]
  )

  return NextResponse.json({ data: rows })
})
