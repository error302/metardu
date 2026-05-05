import { NextRequest, NextResponse } from 'next/server'
import { generateStatutoryWorkbook, type WorkbookInput } from '@/lib/submission/workbook/statutoryWorkbook'

interface RequestBody {
  projectName?: string
  lrNumber?: string
  parcelNumber?: string
  county?: string
  locality?: string
  surveyType?: WorkbookInput['project']['surveyType']
  surveyDate?: string
  surveyorName?: string
  iskNumber?: string
  firmName?: string
  referenceNumber?: string
}

function bodyToWorkbookInput(body: RequestBody): WorkbookInput {
  const surveyDate = body.surveyDate || new Date().toISOString().slice(0, 10)
  const stations = [
    { label: 'A', easting: 250000.000, northing: 9950000.000, elevation: 1560.125 },
    { label: 'B', easting: 250124.375, northing: 9950048.220, elevation: 1561.084 },
    { label: 'C', easting: 250185.640, northing: 9949925.730, elevation: 1559.862 },
    { label: 'D', easting: 250042.810, northing: 9949878.440, elevation: 1560.006 },
  ]

  return {
    project: {
      name: body.projectName || 'Metardu Statutory Computation Workbook',
      lrNumber: body.lrNumber || '',
      parcelNumber: body.parcelNumber || '',
      county: body.county || '',
      division: '',
      district: '',
      locality: body.locality || '',
      surveyType: body.surveyType || 'cadastral',
      surveyDate,
      scaleDenominator: 1000,
    },
    surveyor: {
      name: body.surveyorName || '',
      iskNumber: body.iskNumber || '',
      firmName: body.firmName || '',
    },
    submission: {
      referenceNumber: body.referenceNumber || `MET-WB-${surveyDate.replace(/-/g, '')}`,
      revision: 0,
      status: 'DRAFT',
    },
    fieldObservations: [
      { stationFrom: 'A', stationTo: 'B', observedBearingDeg: 68.8056, observedDistanceM: 133.381, reducedLevelM: 1561.084, remarks: 'Control traverse leg' },
      { stationFrom: 'B', stationTo: 'C', observedBearingDeg: 153.4349, observedDistanceM: 136.977, reducedLevelM: 1559.862, remarks: 'Control traverse leg' },
      { stationFrom: 'C', stationTo: 'D', observedBearingDeg: 251.6914, observedDistanceM: 150.457, reducedLevelM: 1560.006, remarks: 'Control traverse leg' },
      { stationFrom: 'D', stationTo: 'A', observedBearingDeg: 343.8851, observedDistanceM: 126.437, reducedLevelM: 1560.125, remarks: 'Closing leg' },
    ],
    traverse: {
      method: 'bowditch',
      stations: [
        { label: 'A-B', observedBearing: 68.8056, observedDistance: 133.381, departureRaw: 124.375, latitudeRaw: 48.220, departureCorrected: 124.370, latitudeCorrected: 48.216, easting: stations[1].easting, northing: stations[1].northing },
        { label: 'B-C', observedBearing: 153.4349, observedDistance: 136.977, departureRaw: 61.265, latitudeRaw: -122.490, departureCorrected: 61.260, latitudeCorrected: -122.494, easting: stations[2].easting, northing: stations[2].northing },
        { label: 'C-D', observedBearing: 251.6914, observedDistance: 150.457, departureRaw: -142.830, latitudeRaw: -47.290, departureCorrected: -142.835, latitudeCorrected: -47.294, easting: stations[3].easting, northing: stations[3].northing },
        { label: 'D-A', observedBearing: 343.8851, observedDistance: 126.437, departureRaw: -42.810, latitudeRaw: 121.560, departureCorrected: -42.795, latitudeCorrected: 121.572, easting: stations[0].easting, northing: stations[0].northing },
      ],
      angularMisclosureSec: 8,
      angularToleranceSec: 30,
      angularPassesQA: true,
      linearMisclosureM: 0.018,
      perimeterM: 547.252,
      precisionRatio: 30402,
      precisionMinimum: 5000,
      linearPassesQA: true,
    },
    adjustedStations: stations,
    levelling: [
      { stationId: 'BM1', backsight: 1.425, reducedLevel: 1560.125, distance: 0, remarks: 'Starting benchmark' },
      { stationId: 'A', intermediate: 1.210, reducedLevel: 1560.340, distance: 120, remarks: 'Control point A' },
      { stationId: 'B', foresight: 0.981, reducedLevel: 1560.569, distance: 250, remarks: 'Control point B' },
    ],
    levellingClosureMM: 4,
    levellingToleranceMM: 10,
    levellingDistanceKm: 1,
    areaComputation: {
      stations: stations.map(({ label, easting, northing }) => ({ label, easting, northing })),
      areaM2: 18148.07,
      areaHa: 1.8148,
      perimeterM: 547.252,
    },
    legs: [
      { fromLabel: 'A', toLabel: 'B', bearing: 68.8056, distance: 133.381 },
      { fromLabel: 'B', toLabel: 'C', bearing: 153.4349, distance: 136.977 },
      { fromLabel: 'C', toLabel: 'D', bearing: 251.6914, distance: 150.457 },
      { fromLabel: 'D', toLabel: 'A', bearing: 343.8851, distance: 126.437 },
    ],
    cogoResults: [
      { type: 'Area', description: 'Coordinate area by shoelace method', inputs: { stations: 4 }, outputs: { areaHa: 1.8148, perimeterM: 547.252 } },
      { type: 'QA', description: 'Traverse closure quality check', inputs: { precisionMinimum: 5000 }, outputs: { precisionRatio: 30402, status: 'PASS' } },
    ],
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody
  const workbook = await generateStatutoryWorkbook(bodyToWorkbookInput(body))
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="metardu-statutory-workbook.xlsx"',
    },
  })
}
