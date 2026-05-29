import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setCurrentUserId } from '@/lib/db'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { AlignDataRequest, AlignDataResponse } from '@/types/geofusion'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = (session.user as any).id
  if (userId) setCurrentUserId(String(userId))

  try {
    const body: AlignDataRequest = await request.json()
    
    if (!body.project_id || !body.source_layer_id) {
      return NextResponse.json(
        { error: 'project_id and source_layer_id are required' },
        { status: 400 }
      )
    }

    const result = await callPythonCompute<AlignDataResponse>(
      '/geofusion/align',
      body,
      { timeoutMs: 120000 }
    )
    
    if (!result.ok) {
      const err = result as { ok: false; status: number; error: string }
      return NextResponse.json({ error: err.error }, { status: err.status })
    }
    
    return NextResponse.json(result.value)
  } catch (error) {
    console.error('GeoFusion align error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = (session.user as any).id
  if (userId) setCurrentUserId(String(userId))

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      alignments: [],
      message: 'List alignments endpoint'
    })
  } catch (error) {
    console.error('GeoFusion list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
