import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { projectId, points } = body

    if (!projectId || !points || !Array.isArray(points)) {
      return NextResponse.json({ error: 'Invalid request: projectId and points array required' }, { status: 400 })
    }

    const project = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const validPoints = points
      .filter((p: any) => 
        typeof p.easting === 'number' && 
        typeof p.northing === 'number' && 
        typeof p.elevation === 'number'
      )
      .map((p: any) => ({
        project_id: projectId,
        point_type: 'spot_height',
        easting: p.easting,
        northing: p.northing,
        elevation: p.elevation,
        name: p.name || null,
        created_by: user.id
      }))

    if (validPoints.length === 0) {
      return NextResponse.json({ error: 'No valid points provided' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('survey_points')
      .upsert(validPoints, { onConflict: 'project_id,point_type,name' })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      imported: validPoints.length,
      points: data 
    })
  } catch (error) {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
