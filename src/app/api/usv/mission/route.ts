import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setCurrentUserId } from '@/lib/db'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { CreateMissionRequest } from '@/types/usv'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = (session.user as any).id
  if (userId) setCurrentUserId(String(userId))

  try {
    const body: CreateMissionRequest = await request.json()
    
    if (!body.mission_name || !body.waypoints || body.waypoints.length === 0) {
      return NextResponse.json({ error: 'Mission name and waypoints required' }, { status: 400 })
    }
    
    const result = await callPythonCompute<any>(
      '/usv/mission',
      body,
      { timeoutMs: 30000 }
    )
    
    if (!result.ok) {
      const err = result as { ok: false; status: number; error: string }
      return NextResponse.json({ error: err.error }, { status: err.status })
    }
    
    return NextResponse.json(result.value)
  } catch (error) {
    console.error('USV mission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
