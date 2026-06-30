export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { AlignDataRequest, AlignDataResponse } from '@/types/geofusion'
import { GeoFusionAlignSchema } from '@/lib/validation/apiSchemas'

export async function POST(request: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = GeoFusionAlignSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const body = parsed.data as unknown as AlignDataRequest

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
  const { error } = await requireAuth()
  if (error) return error

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
