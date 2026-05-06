import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parcelId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { parcelId } = await params

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
  } catch (err: any) {
    console.error('[GET traverse history] Error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
