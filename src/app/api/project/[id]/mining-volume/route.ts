export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { requireAuth } from '@/lib/auth/requireAuth'
import { MiningVolumeSchema } from '@/lib/validation/apiSchemas'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const { error } = await requireAuth()
    if (error) return error

    const rawBody = await request.json().catch(() => null)
    const parsed = MiningVolumeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const { method, sections, gridPoints, materialDensity, materialType, designElevation, gridSpacing } = parsed.data

    let volumeResult: unknown = null
    if (method === 'end-area') {
      const { calculateEndAreaVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateEndAreaVolumes((sections ?? []) as never, gridSpacing || 20, materialDensity)
    } else if (method === 'grid') {
      const { calculateGridVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateGridVolumes((gridPoints ?? []) as never, gridSpacing || 10, designElevation || 1000, materialDensity)
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
        materialDensity,
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
    const { error } = await requireAuth()
    if (error) return error

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
