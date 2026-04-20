import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callPythonCompute } from '@/lib/compute/pythonService'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const user = session.user as any

    const body = await request.json()
    const { projectId, files, stationLabels } = body

    if (!projectId || !files || files.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 RINEX files to compute baselines' },
        { status: 400 }
      )
    }

    // Create session record
    const sessionRes = await db.query(
      `INSERT INTO gnss_sessions (
        project_id, user_id, status, input_files
      ) VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [projectId, user.id, 'processing', JSON.stringify(files)]
    )
    const gnssSessionId = sessionRes.rows[0].id

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
    await db.query(
      `UPDATE gnss_sessions SET
        status = $1,
        results = $2,
        error_msg = $3,
        updated_at = $4
      WHERE id = $5`,
      [
        results.length > 0 ? 'complete' : 'failed',
        JSON.stringify(results),
        errorMsg,
        new Date().toISOString(),
        gnssSessionId
      ]
    )

    return NextResponse.json({
      sessionId: gnssSessionId,
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
