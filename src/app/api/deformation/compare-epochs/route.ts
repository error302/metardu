export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { compareEpochs } from '@/lib/survey/deformationMonitoring'
import { deformationComparisonSchema } from '@/lib/survey/deformationInput'
import type { z } from 'zod'

export const POST = apiHandler(
  { auth: true, schema: deformationComparisonSchema, rateLimit: { max: 20, windowMs: 60000 } },
  async (_req, ctx) => {
    const body = ctx.body as z.infer<typeof deformationComparisonSchema>
    const report = compareEpochs(body.baseline, body.current, body.tolerance, body.confidenceLevel)
    return NextResponse.json({ data: report })
  },
)
