import { NextRequest, NextResponse } from 'next/server'
import type { DeedPlanInput, DeedPlanOutput } from '@/types/deedPlan'
import { computeBoundaryLegs, computeArea, computeClosureCheck } from '@/lib/compute/deedPlan'
import { renderDeedPlanSVG } from '@/lib/compute/deedPlanRenderer'

export async function POST(request: NextRequest) {
  try {
    const input: DeedPlanInput = await request.json()

    if (!input.boundaryPoints || input.boundaryPoints.length < 3) {
      return NextResponse.json(
        { error: 'A deed plan requires at least 3 boundary points' },
        { status: 400 }
      )
    }

    const bearingSchedule = computeBoundaryLegs(input.boundaryPoints)
    const area = computeArea(input.boundaryPoints)
    const closureCheck = computeClosureCheck(input.boundaryPoints)

    const svg = renderDeedPlanSVG({ ...input, area }, bearingSchedule, closureCheck)

    const output: DeedPlanOutput = {
      svg,
      bearingSchedule,
      coordinateSchedule: input.boundaryPoints,
      closureCheck
    }

    return NextResponse.json(output)
  } catch (error) {
    console.error('Deed plan generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate deed plan' },
      { status: 500 }
    )
  }
}
