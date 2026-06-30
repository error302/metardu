export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { transformCoordinates, type CoordSystem } from '@/lib/geo/transform'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const { coordinates, fromCRS, toCRS } = ctx.body as {
    coordinates?: Array<{ id: string; x: number; y: number; z?: number }>
    fromCRS?: string
    toCRS?: string
  }

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
    return NextResponse.json({ error: 'No coordinates provided' }, { status: 400 })
  }

  if (coordinates.length > 10000) {
    return NextResponse.json(
      { error: 'Use bulk export endpoint for more than 10,000 coordinates' },
      { status: 413 }
    )
  }

  if (!fromCRS || !toCRS) {
    return NextResponse.json(
      { error: 'Both fromCRS and toCRS must be specified' },
      { status: 400 }
    )
  }

  const result = transformCoordinates({
    points: coordinates,
    fromCRS: fromCRS as CoordSystem,
    toCRS: toCRS as CoordSystem
  })

  return NextResponse.json({
    results: result.points,
    fromCRS,
    toCRS
  })
})
