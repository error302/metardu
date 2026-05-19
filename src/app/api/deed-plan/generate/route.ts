import { NextRequest, NextResponse } from 'next/server'
import type { DeedPlanInput, DeedPlanOutput } from '@/types/deedPlan'
import { computeBoundaryLegs, computeArea, computeClosureCheck } from '@/lib/compute/deedPlan'
import { renderDeedPlanSVG } from '@/lib/compute/deedPlanRenderer'

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json()

    // Validate required fields
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const input: DeedPlanInput = {
      surveyNumber: String(raw.surveyNumber || ''),
      drawingNumber: String(raw.drawingNumber || ''),
      parcelNumber: String(raw.parcelNumber || ''),
      locality: String(raw.locality || ''),
      area: Number(raw.area) || 0,
      registrationSection: String(raw.registrationSection || ''),
      county: String(raw.county || ''),
      utmZone: Number(raw.utmZone) || 37,
      hemisphere: raw.hemisphere === 'N' ? 'N' : 'S',
      scale: [500, 1000, 2500, 5000].includes(Number(raw.scale)) ? Number(raw.scale) : 1000,
      datum: raw.datum === 'ARC1960' ? 'ARC1960' : 'WGS84',
      projectionType: String(raw.projectionType || 'UTM'),
      boundaryPoints: [],
      abuttalNorth: String(raw.abuttalNorth || ''),
      abuttalSouth: String(raw.abuttalSouth || ''),
      abuttalEast: String(raw.abuttalEast || ''),
      abuttalWest: String(raw.abuttalWest || ''),
      surveyorName: String(raw.surveyorName || ''),
      iskNumber: String(raw.iskNumber || ''),
      firmName: String(raw.firmName || ''),
      firmAddress: String(raw.firmAddress || ''),
      surveyDate: String(raw.surveyDate || ''),
      signatureDate: String(raw.signatureDate || ''),
      clientName: raw.clientName ? String(raw.clientName) : undefined,
      titleDeedNumber: raw.titleDeedNumber ? String(raw.titleDeedNumber) : undefined,
      firNumber: raw.firNumber ? String(raw.firNumber) : undefined,
      registryMapSheet: raw.registryMapSheet ? String(raw.registryMapSheet) : undefined,
      drawnBy: raw.drawnBy ? String(raw.drawnBy) : undefined,
      checkedBy: raw.checkedBy ? String(raw.checkedBy) : undefined,
    }

    // Validate boundary points
    if (!Array.isArray(raw.boundaryPoints) || raw.boundaryPoints.length < 3) {
      return NextResponse.json(
        { error: 'A deed plan requires at least 3 boundary points' },
        { status: 400 }
      )
    }

    input.boundaryPoints = raw.boundaryPoints.map((p: any, i: number) => ({
      id: String(p.id || `P${i + 1}`),
      easting: Number(p.easting) || 0,
      northing: Number(p.northing) || 0,
      elevation: p.elevation != null ? Number(p.elevation) : undefined,
      markType: String(p.markType || 'CONCRETE_BEACON'),
      markStatus: String(p.markStatus || 'SET'),
      description: p.description ? String(p.description) : undefined,
    }))

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
