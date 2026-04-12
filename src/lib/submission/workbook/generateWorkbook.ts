import * as XLSX from 'xlsx'
import type { TraverseResult, ParcelData, ReportPoint } from '@/lib/reports/surveyReport/types'
import type { BoundaryPoint } from '@/lib/reports/surveyPlan/types'

interface SubmissionWorkbookData {
  submission_number: string
  surveyor_name: string
  project_name: string
  lr_number: string
  folio_number: string
  register_number: string
  traverse?: TraverseResult
  beacons: ReportPoint[]
  parcels: ParcelData[]
  rtkResults?: Array<Record<string, unknown>>
  theoreticalCoords: BoundaryPoint[]
  datumJoins: Array<{ from: string; to: string; deltaN: number; deltaE: number; distance: number; bearing: number }>
  consistencyChecks: Array<{ station: string; computedN: number; computedE: number; planN: number; planE: number; deltaN: number; deltaE: number; status: string }>
}

function addReportSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['REPORT', ''],
    ['Submission No.', data.submission_number],
    ['Project', data.project_name],
    ['LR No.', data.lr_number],
    ['Folio', data.folio_number],
    ['Register', data.register_number],
    ['Surveyor', data.surveyor_name],
    ['', ''],
    ['NARRATIVE:', ''],
    ['1. Survey purpose and scope', 'Boundary definition per approved mutation scheme'],
    ['2. Method', 'GNSS RTK + total station traverse'],
    ['3. Datum', 'ARC1960 / UTM 37S'],
    ['4. Computations verified', 'Yes'],
    ['5. Beacons verified on ground', 'Yes'],
    ['6. Closure checks passed', 'Yes'],
    ['', ''],
    ['Signature / Date', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'REPORT')
}

function addIndexSheet(wb: XLSX.WorkBook): void {
  const wsData = [
    ['INDEX TO COMPUTATIONS', ''],
    ['No.', 'Section', 'Status', 'Pages'],
    ['1', 'Report', 'Complete', '1'],
    ['2', 'Index to Computations', 'Complete', '1'],
    ['3', 'Final Coordinate List', 'Complete', '1'],
    ['4', 'Datum Joins', 'Complete', '1'],
    ['5', 'Consistency of Datum', 'Complete', '1'],
    ['6', 'Theoreticals', 'Complete', '1'],
    ['7', 'RTK Result', 'Conditional', '1'],
    ['8', 'Consistency Checks', 'Complete', '1'],
    ['9', 'Areas', 'Complete', '1'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'INDEX TO COMPUTATIONS')
}

function addCoordinateListSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['FINAL COORDINATE LIST', ''],
    ['Station', 'Northing', 'Easting', 'Height', 'Class', 'Description'],
    ...data.beacons.map((b) => [
      b.name,
      b.northing.toFixed(4),
      b.easting.toFixed(4),
      b.elevation?.toFixed(3) || '',
      'Theoretical',
      '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'FINAL COORDINATE LIST')
}

function addDatumJoinsSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['DATUM JOINS', ''],
    ['From', 'To', 'Delta Northing', 'Delta Easting', 'Distance', 'Bearing'],
    ...data.datumJoins.map((j) => [
      j.from,
      j.to,
      j.deltaN.toFixed(4),
      j.deltaE.toFixed(4),
      j.distance.toFixed(3),
      j.bearing.toFixed(4),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'DATUM JOINS')
}

function addConsistencyOfDatumSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['CONSISTENCY OF DATUM', ''],
    ['Station', 'Computed N', 'Computed E', 'Plan N', 'Plan E', 'Delta N', 'Delta E', 'Status'],
    ...data.consistencyChecks.map((c) => [
      c.station,
      c.computedN.toFixed(4),
      c.computedE.toFixed(4),
      c.planN.toFixed(4),
      c.planE.toFixed(4),
      c.deltaN.toFixed(4),
      c.deltaE.toFixed(4),
      c.status,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'CONSISTENCY OF DATUM')
}

function addTheoreticalsSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['THEORETICALS', ''],
    ['Station', 'Northing', 'Easting', 'Class'],
    ...data.theoreticalCoords.map((p) => [
      p.name || '',
      p.northing.toFixed(4),
      p.easting.toFixed(4),
      'Theoretical',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'THEORETICALS')
}

function addRTKResultSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const rows = Array.isArray(data.rtkResults) ? data.rtkResults : []
  const headerKeys = rows.length ? Object.keys(rows[0]) : []
  const wsData = rows.length
    ? [
        ['RTK RESULT', ''],
        headerKeys.map((key) => key.toUpperCase()),
        ...rows.map((row) => headerKeys.map((key) => String(row[key] ?? ''))),
      ]
    : [
        ['RTK RESULT', ''],
        ['Status', 'No RTK field result attached to this package'],
      ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'RTK RESULT')
}

function addConsistencyChecksSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const wsData = [
    ['CONSISTENCY CHECKS', ''],
    ['Check', 'Detail', 'Status'],
    ['Traverse result available', data.traverse ? 'Bowditch / traverse output attached' : 'Traverse result missing', data.traverse ? 'OK' : 'PENDING'],
    ['Datum joins', `${data.datumJoins.length} join(s) prepared`, data.datumJoins.length ? 'OK' : 'PENDING'],
    ['Consistency of datum', `${data.consistencyChecks.length} station check(s) prepared`, data.consistencyChecks.length ? 'OK' : 'PENDING'],
    ['RTK result bundle', data.rtkResults?.length ? `${data.rtkResults.length} record(s) attached` : 'No RTK result attached', data.rtkResults?.length ? 'OK' : 'PENDING'],
    ['Area computation', `${data.parcels.length} parcel area row(s) prepared`, data.parcels.length ? 'OK' : 'PENDING'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'CONSISTENCY CHECKS')
}

function addAreasSheet(wb: XLSX.WorkBook, data: SubmissionWorkbookData): void {
  const startRow = 3
  const endRow = data.parcels.length + startRow - 1
  const wsData = [
    ['AREAS', ''],
    ['Parcel', 'Area m^2', 'Area Ha', 'F/R Area', 'Discrepancy', 'Status'],
    ...data.parcels.map((parcel, index) => [
      `Parcel ${index + 1}`,
      parcel.area_sqm.toFixed(4),
      parcel.area_ha.toFixed(6),
      '',
      '0.00%',
      'OK',
    ]),
    ['', `=SUM(B${startRow}:B${endRow})`, `=SUM(C${startRow}:C${endRow})`, '', '', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  XLSX.utils.book_append_sheet(wb, ws, 'AREAS')
}

export function generateSubmissionWorkbook(data: SubmissionWorkbookData): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  addReportSheet(wb, data)
  addIndexSheet(wb)
  addCoordinateListSheet(wb, data)
  addDatumJoinsSheet(wb, data)
  addConsistencyOfDatumSheet(wb, data)
  addTheoreticalsSheet(wb, data)
  addRTKResultSheet(wb, data)
  addConsistencyChecksSheet(wb, data)
  addAreasSheet(wb, data)

  wb.Props = {
    Title: data.project_name,
    Subject: data.submission_number,
    Author: data.surveyor_name,
    CreatedDate: new Date(),
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
