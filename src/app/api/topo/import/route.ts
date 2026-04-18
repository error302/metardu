import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'

export async function POST(req: NextRequest) {
  try {
    const dbClient = await createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    const user = session?.user ?? null
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { projectId, points } = body

    if (!projectId || !points || !Array.isArray(points)) {
      return NextResponse.json({ error: 'Invalid request: projectId and points array required' }, { status: 400 })
    }

    const project = await dbClient
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

    const { data, error } = await dbClient
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
