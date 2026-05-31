import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setCurrentUserId } from '@/lib/db'
import { z } from 'zod'
import { generateTIN, interpolateElevation, type TINPoint } from '@/lib/compute/tin'
import { callPythonCompute } from '@/lib/compute/pythonService'
import { apiSuccess, apiError } from '@/lib/api/response'

const TINPointSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
})

const TINRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  points: z.array(TINPointSchema).min(3).max(50000),
  query_points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = (session.user as any).id
  if (userId) setCurrentUserId(String(userId))

  const body = await request.json().catch(() => null)
  const parsed = TINRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      apiError('Invalid request.', { issues: parsed.error.issues }),
      { status: 400 }
    )
  }

  try {
    const triangles = generateTIN(parsed.data.points as TINPoint[])

    let interpolations: Array<{ x: number; y: number; elevation: number | null }> = []
    if (parsed.data.query_points) {
      interpolations = parsed.data.query_points.map((qp): { x: number; y: number; elevation: number | null } => ({
        x: qp.x,
        y: qp.y,
        elevation: interpolateElevation(triangles, qp.x, qp.y),
      }))
    }

    return NextResponse.json(apiSuccess({
      triangle_count: triangles.length,
      point_count: parsed.data.points.length,
      triangles: triangles.slice(0, 1000), // Cap response size — client can paginate
      interpolations,
      python_required: false,
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TIN generation failed'
    return NextResponse.json(apiError(message), { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  return NextResponse.json(apiSuccess({
    endpoint: '/api/compute/tin',
    description: 'Triangulated Irregular Network generation (native TypeScript via Delaunator).',
    python_required: false,
  }))
}
