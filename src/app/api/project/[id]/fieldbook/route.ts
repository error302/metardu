export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params

  const { rows } = await db.query(
    `SELECT * FROM project_fieldbook_entries
     WHERE project_id = $1
     ORDER BY row_index ASC`,
    [id]
  )

  return NextResponse.json({ data: rows })
})
