import { NextRequest, NextResponse } from 'next/server'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { AnalyzeSafetyRequest, AnalyzeSafetyResponse } from '@/types/safety'

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeSafetyRequest = await request.json()
    
    const result = await callPythonCompute<AnalyzeSafetyResponse>(
      '/safety/analyze',
      body,
      { timeoutMs: 60000 }
    )
    
    if (!result.ok) {
      const err = result as { ok: false; status: number; error: string }
      return NextResponse.json({ error: err.error }, { status: err.status })
    }
    
    return NextResponse.json(result.value)
  } catch (error) {
    console.error('Safety analysis error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
