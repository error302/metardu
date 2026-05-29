import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { ProcessBathymetryRequest, ProcessBathymetryResponse } from '@/types/bathymetry'

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 10, windowMs: 60_000 } },
  async (req, ctx) => {
    const body = ctx.body as ProcessBathymetryRequest

    if (!body.soundings || body.soundings.length === 0) {
      return NextResponse.json({ error: 'No soundings provided' }, { status: 400 })
    }

    const result = await callPythonCompute<ProcessBathymetryResponse>(
      '/bathymetry/process',
      body,
      { timeoutMs: 60000 }
    )

    if (!result.ok) {
      const err = result as { ok: false; status: number; error: string }
      return NextResponse.json({ error: err.error }, { status: err.status })
    }

    return NextResponse.json(result.value)
  }
)
