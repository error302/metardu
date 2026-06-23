import { NextRequest, NextResponse } from 'next/server'
import { calculateEDMCorrection, calculateScaleCorrection, combinedEDMCorrection, estimateAccuracy } from '@/lib/online/weather'
import { EDMCorrectionSchema } from '@/lib/validation/apiSchemas'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()

    const parsed = EDMCorrectionSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const body = parsed.data

    const result = calculateEDMCorrection(body)

    if (body.distance !== undefined && body.elevation !== undefined && body.latitude !== undefined) {
      const corrected = combinedEDMCorrection(body.distance, body, body.elevation, body.latitude)
      const accuracy = estimateAccuracy(body.distance, body, body.instrumentAccuracy)
      return NextResponse.json({
        ...result,
        correctedDistance: corrected,
        correctionApplied: corrected - body.distance,
        estimatedAccuracy: accuracy
      })
    }

    if (body.elevation !== undefined && body.latitude !== undefined) {
      const scaleCorrection = calculateScaleCorrection(body.elevation, body.latitude)
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
