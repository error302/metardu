import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const { parcelId } = ctx.params

  const { rows } = await db.query(
    `SELECT th.*, p.parcel_number, b.block_number, proj.name as project_name
     FROM traverse_history th
     JOIN parcel_traverses pt ON pt.id = th.parcel_traverse_id
     JOIN parcels p ON p.id = pt.parcel_id
     JOIN blocks b ON b.id = p.block_id
     JOIN projects proj ON proj.id = b.project_id
     WHERE pt.parcel_id = $1
     ORDER BY th.version DESC`,
    [parcelId]
  )

  return NextResponse.json({ data: rows })
})
