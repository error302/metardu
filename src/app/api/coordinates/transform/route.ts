import { NextRequest, NextResponse } from 'next/server'
import { transformCoordinates, getSupportedSystems, CoordinateSystem } from '@/lib/online/coordinates'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      latitude, 
      longitude, 
      easting, 
      northing, 
      zone, 
      hemisphere,
      fromSystem, 
      toSystem 
    } = body

    if (!fromSystem || !toSystem) {
      return NextResponse.json(
        { error: 'Missing required parameters: fromSystem, toSystem' },
        { status: 400 }
      )
    }

    const validSystems: CoordinateSystem[] = [
      'WGS84', 'UTM', 'ARC1960', 'HARTEBEESTHOEK94', 
      'ADINDAN', 'CAPE', 'ED50', 'PSAD56'
    ]

    if (!validSystems.includes(fromSystem) || !validSystems.includes(toSystem)) {
      return NextResponse.json(
        { error: 'Invalid coordinate system' },
        { status: 400 }
      )
    }

    const result = await transformCoordinates(
      { latitude, longitude, easting, northing, zone, hemisphere },
      fromSystem,
      toSystem
    )

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transformation failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ systems: getSupportedSystems() })
}
