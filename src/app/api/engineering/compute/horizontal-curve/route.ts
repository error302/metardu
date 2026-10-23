export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { computeHorizontalCurve } from '@/lib/engine/engineering'
import { z } from 'zod'

const HorizontalCurveRequestSchema = z.object({
  radius: z.number().finite().positive(),
  delta: z.number().finite().positive().lt(180),
  piChainage: z.number().finite(),
}).strict()

export const POST = apiHandler({ auth: true, schema: HorizontalCurveRequestSchema,
  rateLimit: { max: 60, windowMs: 60000 } }, async (_req, ctx) => {
  const { radius, delta, piChainage } = ctx.body as z.infer<typeof HorizontalCurveRequestSchema>
  try {
    const result = computeHorizontalCurve(radius, delta, piChainage)
    return NextResponse.json({ ...result, contractVersion: 2,
      units: { distance: 'm', station: 'm', angle: 'degrees' } },
    { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid horizontal curve geometry.',
      code: 'INVALID_HORIZONTAL_GEOMETRY' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
  }
})
