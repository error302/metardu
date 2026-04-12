import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processSeabedSurvey, SeabedObservationSchema, type SeabedObservation } from '@/lib/compute/seabed'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { apiSuccess, apiError } from '@/lib/api/response'

const SeabedRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  observations: z.array(SeabedObservationSchema).min(1).max(10000),
  chart_datum_offset_m: z.number(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  // Try native TS processing first
  const parsed = SeabedRequestSchema.safeParse(body)
  if (parsed.success) {
    try {
      const result = await processSeabedSurvey(
        parsed.data.project_id ?? 'unknown',
        parsed.data.observations as SeabedObservation[],
        parsed.data.chart_datum_offset_m
      )
      return NextResponse.json(apiSuccess({
        ...result,
        python_required: false,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Seabed processing failed'
      return NextResponse.json(apiError(message), { status: 500 })
    }
  }

  // Fallback to Python service if native TS parsing fails (e.g., different schema)
  const python = await callPythonCompute<unknown>('/hydro/seabed', body, { timeoutMs: 30000 })
  if (!python.ok) {
    const err = python as { ok: false; status: number; error: string; fallback?: boolean; details?: unknown }
    return NextResponse.json(
      apiError(err.error, { fallback: err.fallback ?? true, details: err.details, python_required: true }),
      { status: err.status }
    )
  }
  return NextResponse.json(python.value)
}

export async function GET() {
  return NextResponse.json(apiSuccess({
    endpoint: '/api/compute/seabed',
    description: 'Hydrographic seabed modeling (native TypeScript with Python fallback).',
    python_required: false,
  }))
}
