import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { z } from 'zod'
import { processSeabedSurvey, SeabedObservationSchema, type SeabedObservation } from '@/lib/compute/seabed'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { apiError } from '@/lib/api/response'

const SeabedRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  observations: z.array(SeabedObservationSchema).min(1).max(10000),
  chart_datum_offset_m: z.number(),
})

export const POST = apiHandler(
  { auth: true, schema: SeabedRequestSchema, audit: 'compute_seabed' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const data = ctx.body as z.infer<typeof SeabedRequestSchema>

    try {
      const result = await processSeabedSurvey(
        data.project_id ?? 'unknown',
        data.observations as SeabedObservation[],
        data.chart_datum_offset_m
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
)

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async () => {
    return NextResponse.json(apiSuccess({
      endpoint: '/api/compute/seabed',
      description: 'Hydrographic seabed modeling (native TypeScript with Python fallback).',
      python_required: false,
    }))
  }
)
