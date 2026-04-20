import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { method, sections, gridPoints, materialDensity, materialType, designElevation, gridSpacing } = body

    let volumeResult = null
    if (method === 'end-area') {
      const { calculateEndAreaVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateEndAreaVolumes(sections, gridSpacing || 20, materialDensity || 1.8)
    } else if (method === 'grid') {
      const { calculateGridVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateGridVolumes(gridPoints, gridSpacing || 10, designElevation || 1000, materialDensity || 1.8)
    }

    const res = await db.query(
      `INSERT INTO mining_surveys (
        project_id, mine_type, sections, grid_points, material_density_tm3, material_type, volume_result, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        projectId,
        method,
        JSON.stringify(sections || []),
        JSON.stringify(gridPoints || []),
        materialDensity || 1.8,
        materialType || 'overburden',
        JSON.stringify(volumeResult),
        'completed'
      ]
    )

    return NextResponse.json({
      success: true,
      miningSurvey: res.rows[0],
      volumeResult
    })
  } catch (error) {
    console.error('Mining volume calculation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await db.query(
      'SELECT * FROM mining_surveys WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    )

    return NextResponse.json({ miningSurveys: res.rows })
  } catch (error) {
    console.error('Mining volume GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
