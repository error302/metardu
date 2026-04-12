import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { transformCoordinates, type CoordSystem } from '@/lib/geo/transform'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { coordinates, fromCRS, toCRS } = body

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
  } catch (error) {
    console.error('Transform error:', error)
    return NextResponse.json(
      { error: 'Coordinate transformation failed' },
      { status: 500 }
    )
  }
}