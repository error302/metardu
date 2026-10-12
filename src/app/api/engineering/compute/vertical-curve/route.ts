export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { computeVerticalCurve } from '@/lib/engine/engineering'
import { z } from 'zod'

const VerticalCurveRequestSchema = z.object({
  pvIChainage: z.number().finite(),
  pvIElevation: z.number().finite(),
  gradeIn: z.number().finite(),
  gradeOut: z.number().finite(),
  length: z.number().finite().positive(),
})

export const POST = apiHandler({ auth: true, schema: VerticalCurveRequestSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { pvIChainage, pvIElevation, gradeIn, gradeOut, length } = ctx.body as z.infer<typeof VerticalCurveRequestSchema>

  const result = computeVerticalCurve(pvIChainage, pvIElevation, gradeIn, gradeOut, length)

  return NextResponse.json(result)
})
