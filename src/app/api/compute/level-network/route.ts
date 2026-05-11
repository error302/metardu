/**
 * Level Network Adjustment API
 *
 * POST /api/compute/level-network
 *
 * Accepts leveling observations and control points, runs weighted LSQ
 * adjustment, and returns adjusted RLs with residuals and misclosure check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { adjustLevelNetwork } from '@/lib/survey/digitalLevel/levelNetworkAdjustment'
import { generateBenchmarkSheet, validateBenchmarkSheet } from '@/lib/survey/digitalLevel/benchmarkSheet'
import { LevelObservation, LevelControlPoint } from '@/lib/survey/digitalLevel/digitalLevelTypes'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { observations, controlPoints, order, metadata } = body

    // Validate inputs
    if (!Array.isArray(observations) || observations.length === 0) {
      return NextResponse.json(
        { error: 'At least one observation is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(controlPoints) || controlPoints.length === 0) {
      return NextResponse.json(
        { error: 'At least one control point is required' },
        { status: 400 }
      )
    }

    // Validate observation structure
    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i]
      if (!obs.fromId || !obs.toId || typeof obs.heightDifference !== 'number') {
        return NextResponse.json(
          { error: `Observation at index ${i} is missing required fields (fromId, toId, heightDifference)` },
          { status: 400 }
        )
      }
    }

    // Run adjustment
    const result = adjustLevelNetwork(observations, controlPoints, order || 'third')

    // Generate benchmark sheet
    const sheet = generateBenchmarkSheet(result, controlPoints, {
      projectName: metadata?.projectName,
      surveyor: metadata?.surveyor,
      date: metadata?.date,
      instrument: metadata?.instrument,
      staff: metadata?.staff,
      remarks: metadata?.remarks,
    })

    // Validate sheet
    const validation = validateBenchmarkSheet(sheet)

    return NextResponse.json({
      adjustment: result,
      benchmarkSheet: sheet,
      validation,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Level network adjustment failed' },
      { status: 500 }
    )
  }
}
