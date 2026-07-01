export const dynamic = 'force-dynamic'

/**
 * Area Computation API Route
 *
 * SECURITY: Requires authentication. Previously unauthenticated —
 * pure math so no data leak, but unauthenticated CPU-heavy work
 * was a DoS vector.
 */

import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { computeAreaByShoelace, computeAreaByDMD, convertArea } from '@/lib/survey/area/computation'
import type { Point } from '@/lib/survey/cogo/engine'
import { AreaOperationSchema } from '@/lib/validation/apiSchemas'

export const POST = apiHandler(
  { auth: true, schema: AreaOperationSchema, rateLimit: { max: 100, windowMs: 60000 } },
  async (req, ctx) => {
    const body = ctx.body as z.infer<typeof AreaOperationSchema>
    switch (body.operation) {
      case 'shoelace': {
        const result = computeAreaByShoelace(body.points as Point[])
        return NextResponse.json(result)
      }
      case 'dmd': {
        const result = computeAreaByDMD(body.bearings, body.distances)
        return NextResponse.json(result)
      }
      case 'convert': {
        const result = convertArea(body.value, body.from as Parameters<typeof convertArea>[1], body.to as Parameters<typeof convertArea>[2])
        return NextResponse.json({ value: result, from: body.from, to: body.to })
      }
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${(body as { operation?: string }).operation}. Use: shoelace, dmd, convert` },
          { status: 400 }
        )
    }
  }
)
