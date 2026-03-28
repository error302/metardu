import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { callPythonCompute } from '@/lib/compute/pythonService'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, files, stationLabels } = body

    if (!projectId || !files || files.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 RINEX files to compute baselines' },
        { status: 400 }
      )
    }

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('gnss_sessions')
      .insert({
        project_id: projectId,
        user_id: user.id,
        status: 'processing',
        input_files: files
      })
      .select()
      .single()

    if (sessionError) throw sessionError

    // Call Python service for processing
    const result = await callPythonCompute<any>('/gnss/process', {
      files,
      stationLabels
    })

    let results = []
    let status: 'complete' | 'failed' | 'simulated' = 'complete'
    let errorMsg: string | undefined

    if (result.ok) {
      results = result.value?.baselines || []
    } else if (result.fallback) {
      // Simulation mode - generate mock results
      status = 'simulated'
      results = generateMockBaselines(stationLabels)
      errorMsg = result.error
    } else {
      status = 'failed'
      errorMsg = result.error
    }

    // Update session with results
    await supabase
      .from('gnss_sessions')
      .update({
        status: results.length > 0 ? 'complete' : 'failed',
        results,
        error_msg: errorMsg,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id)

    return NextResponse.json({
      sessionId: session.id,
      results,
      status,
      message: status === 'simulated' ? 'Simulation mode — upload valid RINEX for real processing' : undefined
    })
  } catch (error) {
    console.error('GNSS processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process GNSS data' },
      { status: 500 }
    )
  }
}

function generateMockBaselines(stationLabels: string[]): any[] {
  const baselines = []
  
  if (stationLabels.length >= 2) {
    // Generate mock baselines between stations
    for (let i = 0; i < stationLabels.length - 1; i++) {
      const distance = 500 + Math.random() * 2000
      const bearing = Math.random() * 360
      
      baselines.push({
        fromStation: stationLabels[0],
        toStation: stationLabels[i + 1],
        deltaX: distance * Math.sin(bearing * Math.PI / 180),
        deltaY: distance * Math.cos(bearing * Math.PI / 180),
        deltaZ: (Math.random() - 0.5) * 50,
        distance: Math.round(distance * 1000) / 1000,
        rmsError: 0.005 + Math.random() * 0.015,
        ratio: 5 + Math.random() * 20,
        fixed: Math.random() > 0.3,
        toEasting: 500000 + Math.random() * 100000,
        toNorthing: 9900000 + Math.random() * 100000,
        toElevation: 1500 + Math.random() * 500,
        qualityClass: 'A'
      })
    }
  }
  
  return baselines
}
