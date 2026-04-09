import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EngineeringSubtype } from '@/lib/engine/engineering'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('engineering_survey_data')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (error || !data) {
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Engineering data GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, subtype, data } = body as {
      projectId: string
      subtype: EngineeringSubtype
      data: Record<string, unknown>
    }

    if (!projectId || !subtype || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: result, error } = await supabase
      .from('engineering_survey_data')
      .upsert(
        { project_id: projectId, subtype, data },
        { onConflict: 'project_id' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Engineering data POST error:', error)
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 })
  }
}