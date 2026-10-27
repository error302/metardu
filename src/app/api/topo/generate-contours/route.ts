export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { generateTINContours } from '@/lib/topo/tinContours'
import { buildBreaklineTIN } from '@/lib/topo/breaklineTIN'
import { checkTINSlopes } from '@/lib/topo/tinDiagnostics'
import { z } from 'zod'

const schema = z.object({
  points: z.array(z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })).min(3).max(10000),
  breaklines: z.array(z.object({
    points: z.array(z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })).min(2).max(2001),
    type: z.enum(['hard', 'soft', 'ridge', 'valley']).prefault('hard'),
  })).max(2000).prefault([]),
  interval: z.number().finite().positive().prefault(1),
  maxSlope: z.number().finite().positive().max(90).prefault(45),
  // Retained request key; controls contour vertex spacing, not a raster grid.
  gridResolution: z.number().finite().positive().prefault(5),
})

export const POST = apiHandler(
  { auth: true, schema, rateLimit: { max: 10, windowMs: 60000 } },
  async (_req, ctx) => {
    const body = ctx.body as z.infer<typeof schema>
    try {
      const tin = buildBreaklineTIN(body.points, body.breaklines)
      const contourLines = generateTINContours(tin, { interval: body.interval, maxVertexSpacing: body.gridResolution })
      const sanity = checkTINSlopes(tin, body.maxSlope)
      return NextResponse.json({ data: {
        contours: contourLines, sanity,
        algorithm: 'constrained-tin-isolines',
        tinInfo: {
          triangleCount: tin.triangles.length, removedTriangles: tin.removedTriangles,
          hasConstraints: tin.hasConstraints, breaklineCount: body.breaklines.length,
        },
      } })
    } catch (error) {
      if (error instanceof RangeError) return NextResponse.json({ error: error.message, code: 'SURFACE_INPUT_INVALID' }, { status: 400 })
      throw error
    }
  },
)
