export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { transformCoordinates, TransformInput } from '@/lib/geo/transform'
import { GeoTransformSchema } from '@/lib/validation/apiSchemas'
import { CrsError } from '@/lib/spatial/projectCrs'

export const POST = apiHandler({ auth: true, schema: GeoTransformSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const body = ctx.body as z.infer<typeof GeoTransformSchema> & { projectId?: string }

  const transformInput: TransformInput & { projectId?: string } = {
    fromCRS: body.fromCRS,
    toCRS: body.toCRS,
    points: body.points.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
    projectId: body.projectId,
  }

  let result: ReturnType<typeof transformCoordinates>
  try { result = transformCoordinates(transformInput) }
  catch (error) {
    if (!(error instanceof CrsError)) throw error
    return NextResponse.json({ error: error.message, code: 'COORDINATE_TRANSFORM_REJECTED' }, { status: 422 })
  }

  await db.query<never>(
    `INSERT INTO online_service_logs (
      user_id, project_id, service, input_summary, status
    ) VALUES ($1, $2, $3, $4, $5)`,
    [
      ctx.userId,
      body.projectId ?? null,
      'coordinate-transform',
      `${body.points.length} points, ${body.fromCRS} → ${body.toCRS}`,
      'success',
    ]
  )

  return NextResponse.json(result)
})
