import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    const userId = (session.user as any).id

    // Fetch project with scheme details
    const { rows } = await db.query(
      `SELECT p.*, 
        sd.scheme_number, sd.county, sd.sub_county, sd.ward, 
        sd.planned_parcels, sd.adjudication_section, sd.status as scheme_status
       FROM projects p
       LEFT JOIN scheme_details sd ON sd.project_id = p.id
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, userId]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ data: rows[0] })
  } catch (err: any) {
    console.error('[GET /api/project/[id]] Error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
