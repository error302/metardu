export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { CrossSectionVolumeSchema, crossSectionVolume } from '@/lib/engineering/compute'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body: unknown = await req.json()
    const input = CrossSectionVolumeSchema.parse(body)
    
    const result = crossSectionVolume(input)
    
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    logger.error('Volume compute error:', { error })
    return NextResponse.json({ error: 'Computation failed' }, { status: 500 })
  }
}
