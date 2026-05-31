import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { horizontalCurve, HorizontalCurveSchema } from '@/lib/engineering/compute'

const CurveComputeSchema = z.object({
  R: z.number().positive().max(2000),
  deltaDeg: z.number().positive().max(180),
  chainageStart: z.number().min(0).default(0),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const input = CurveComputeSchema.parse(body)
    
    const result = horizontalCurve(input)
    
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Curve compute error:', error)
    return NextResponse.json({ error: 'Computation failed' }, { status: 500 })
  }
}
