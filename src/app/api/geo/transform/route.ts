import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { transformCoordinates, TransformInput } from '@/lib/geo/transform'

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const body = ctx.body as TransformInput & { projectId?: string }

  if (!body.points?.length || !body.fromCRS || !body.toCRS) {
    return NextResponse.json({ error: 'Missing points, fromCRS, or toCRS' }, { status: 400 })
  }

  if (body.points.length > 5000) {
    return NextResponse.json({ error: 'Maximum 5000 points per request' }, { status: 400 })
  }

  const result = transformCoordinates(body)

  await db.query(
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
