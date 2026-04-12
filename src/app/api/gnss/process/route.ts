import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { callPythonCompute } from '@/lib/compute/pythonService'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authSession } = await supabase.auth.getSession()
    const user = authSession.session?.user ?? null
    
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
    const { data: gnssSession, error: sessionError } = await supabase
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
    } else if ((result as { ok: false; fallback?: boolean }).fallback) {
      // Simulation mode - generate mock results
      status = 'simulated'
      results = generateMockBaselines(stationLabels)
      errorMsg = (result as { error: string }).error
    } else {
      status = 'failed'
      errorMsg = (result as { error: string }).error
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
      .eq('id', gnssSession.id)

    return NextResponse.json({
      sessionId: gnssSession.id,
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
  // No fabricated baseline data — return empty result
  return []
}
