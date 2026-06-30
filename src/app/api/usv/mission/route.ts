export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { CreateMissionRequest } from '@/types/usv'
import { USVMissionSchema } from '@/lib/validation/apiSchemas'

export async function POST(request: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = USVMissionSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const body = parsed.data as unknown as CreateMissionRequest

    const result = await callPythonCompute<unknown>(
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
