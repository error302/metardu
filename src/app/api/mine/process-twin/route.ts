import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { callPythonCompute } from '@/lib/compute/pythonService'
import type { ProcessTwinRequest, ProcessTwinResponse } from '@/types/minetwin'

export const POST = apiHandler({ auth: true, rateLimit: { max: 10, windowMs: 60000 } }, async (request, ctx) => {
  const body: ProcessTwinRequest = ctx.body as ProcessTwinRequest

  if (!body.points || body.points.length === 0) {
    return NextResponse.json({ error: 'No points provided' }, { status: 400 })
  }

  const result = await callPythonCompute<ProcessTwinResponse>(
    '/mine-twin',
    body,
    { timeoutMs: 60000 }
  )

  if (!result.ok) {
    const err = result as { ok: false; status: number; error: string }
    return NextResponse.json({ error: err.error }, { status: err.status })
  }

  return NextResponse.json(result.value)
})
