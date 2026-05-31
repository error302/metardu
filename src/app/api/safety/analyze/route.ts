import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { AnalyzeSafetyRequest, AnalyzeSafetyResponse } from '@/types/safety'

export const POST = apiHandler({ auth: true, rateLimit: { max: 10, windowMs: 60000 } }, async (request, ctx) => {
  const body: AnalyzeSafetyRequest = ctx.body as AnalyzeSafetyRequest

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
})
