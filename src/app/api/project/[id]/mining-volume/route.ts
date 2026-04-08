import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const body = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { method, sections, gridPoints, materialDensity, materialType, designElevation, gridSpacing } = body

    let volumeResult = null

    if (method === 'end-area') {
      const { calculateEndAreaVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateEndAreaVolumes(sections, gridSpacing || 20, materialDensity || 1.8)
    } else if (method === 'grid') {
      const { calculateGridVolumes } = await import('@/lib/mining/volumeEngine')
      volumeResult = calculateGridVolumes(gridPoints, gridSpacing || 10, designElevation || 1000, materialDensity || 1.8)
    }

    const { data: miningSurvey, error } = await supabase
      .from('mining_surveys')
      .insert({
        project_id: projectId,
        mine_type: method,
        sections: sections || [],
        grid_points: gridPoints || [],
        material_density_tm3: materialDensity || 1.8,
        material_type: materialType || 'overburden',
        volume_result: volumeResult,
        status: 'completed'
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving mining survey:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      miningSurvey,
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: miningSurveys, error } = await supabase
      .from('mining_surveys')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ miningSurveys })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
