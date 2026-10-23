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
}).strict()

export const POST = apiHandler({ auth: true, schema: VerticalCurveRequestSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { pvIChainage, pvIElevation, gradeIn, gradeOut, length } = ctx.body as z.infer<typeof VerticalCurveRequestSchema>

  try {
    const result = computeVerticalCurve(pvIChainage, pvIElevation, gradeIn, gradeOut, length)
    return NextResponse.json({ ...result, contractVersion: 2,
      units: { station: 'm', elevation: 'm', grade: 'percent' } },
    { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid vertical curve geometry.',
      code: 'INVALID_VERTICAL_GEOMETRY' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
  }
})
