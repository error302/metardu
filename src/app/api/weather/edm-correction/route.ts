import { NextRequest, NextResponse } from 'next/server'
import { calculateEDMCorrection, calculateScaleCorrection, combinedEDMCorrection, estimateAccuracy } from '@/lib/online/weather'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { temperature, pressure, humidity, elevation, distance, instrumentAccuracy } = body

    if (temperature === undefined || pressure === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: temperature, pressure' },
        { status: 400 }
      )
    }

    if (humidity === undefined) {
      body.humidity = 50
    }

    const result = calculateEDMCorrection(body)

    if (distance !== undefined && elevation !== undefined && body.latitude !== undefined) {
      const corrected = combinedEDMCorrection(distance, body, elevation, body.latitude)
      const accuracy = estimateAccuracy(distance, body, instrumentAccuracy || 3)
      return NextResponse.json({
        ...result,
        correctedDistance: corrected,
        correctionApplied: corrected - distance,
        estimatedAccuracy: accuracy
      })
    }

    if (elevation !== undefined && body.latitude !== undefined) {
      const scaleCorrection = calculateScaleCorrection(elevation, body.latitude)
      return NextResponse.json({
        ...result,
        scaleCorrection
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Calculation failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'EDM atmospheric correction calculator',
    parameters: {
      temperature: 'Temperature in Celsius (required)',
      pressure: 'Atmospheric pressure in hPa/mbar (required)',
      humidity: 'Relative humidity in % (optional, default 50)',
      elevation: 'Height above sea level in meters (optional)',
      latitude: 'Latitude in degrees (required for scale correction)',
      distance: 'Measured distance in meters (optional)',
      instrumentAccuracy: 'Instrument accuracy in mm (default: 3)'
    },
    example: {
      temperature: 25,
      pressure: 1013.25,
      humidity: 60,
      elevation: 1500,
      latitude: -1.2921
    }
  })
}
