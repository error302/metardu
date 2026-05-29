import * as XLSX from 'xlsx'
import type { SubmissionPackage } from '../types'

export function generateComputationWorkbook(pkg: SubmissionPackage): Buffer {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Project Details
  const projectSheet = XLSX.utils.aoa_to_sheet([
    ['METARDU COMPUTATION WORKBOOK'],
    [''],
    ['FORM NO. 5 — COMPUTATION SHEET'],
    [''],
    ['Submission Reference', pkg.submissionRef],
    ['LR Number', pkg.parcel.lrNumber],
    ['Parcel Number', pkg.parcel.parcelNumber || pkg.parcel.lrNumber],
    ['County', pkg.parcel.county],
    ['Division', pkg.parcel.division || '-'],
    ['District', pkg.parcel.district],
    ['Locality', pkg.parcel.locality],
    ['Survey Type', pkg.subtype],
    ['Revision', `R${String(pkg.revision).padStart(2, '0')}`],
    [''],
    ['SURVEYOR DETAILS'],
    ['Name', pkg.surveyor.fullName],
    ['ISK Number', pkg.surveyor.iskNumber || pkg.surveyor.registrationNumber],
    ['Firm', pkg.surveyor.firmName],
    ['Date', new Date(pkg.generatedAt).toLocaleDateString('en-KE')],
  ])
  XLSX.utils.book_append_sheet(wb, projectSheet, 'Project Details')

  // Sheet 2: Traverse Computation
  const traverseHeaders = [
    'Point',
    'Observed Bearing (°)',
    'Observed Distance (m)',
    'Easting (m)',
    'Northing (m)',
    'Adjusted Easting (m)',
    'Adjusted Northing (m)',
    'Correction E (m)',
    'Correction N (m)'
  ]

  const traverseRows = pkg.traverse.points.map(pt => [
    pt.pointName,
    pt.observedBearing.toFixed(6),
    pt.observedDistance.toFixed(4),
    pt.easting.toFixed(4),
    pt.northing.toFixed(4),
    pt.adjustedEasting.toFixed(4),
    pt.adjustedNorthing.toFixed(4),
    (pt.adjustedEasting - pt.easting).toFixed(4),
    (pt.adjustedNorthing - pt.northing).toFixed(4)
  ])

  const traverseSheet = XLSX.utils.aoa_to_sheet([
    ['TRAVERSE COMPUTATION'],
    ['Method', pkg.traverse.adjustmentMethod === 'transit' ? 'Transit (Least Squares)' : 'Bowditch'],
    [''],
    traverseHeaders,
    ...traverseRows,
    [''],
    ['CLOSURE SUMMARY'],
    ['Angular Misclosure', pkg.traverse.angularMisclosure.toFixed(4), '"'],
    ['Linear Misclosure', pkg.traverse.linearMisclosure.toFixed(4), 'm'],
    ['Precision Ratio', pkg.traverse.precisionRatio],
    ['Closing Error E', pkg.traverse.closingErrorE.toFixed(4), 'm'],
    ['Closing Error N', pkg.traverse.closingErrorN.toFixed(4), 'm'],
  ])
  XLSX.utils.book_append_sheet(wb, traverseSheet, 'Traverse Computation')

  // Sheet 3: Coordinates
  const coordHeaders = ['Point', 'Easting (m)', 'Northing (m)', 'Category']
  const coordRows = pkg.traverse.points.map((pt, i) => [
    pt.pointName,
    pt.adjustedEasting.toFixed(4),
    pt.adjustedNorthing.toFixed(4),
    i === 0 || i === pkg.traverse.points.length - 1 ? 'Boundary Beacon' : 'Boundary Beacon'
  ])

  const coordSheet = XLSX.utils.aoa_to_sheet([
    ['FINAL ADJUSTED COORDINATES'],
    ['Coordinate System: Arc 1960 / UTM Zone 37S (SRID: 21037)'],
    [''],
    coordHeaders,
    ...coordRows
  ])
  XLSX.utils.book_append_sheet(wb, coordSheet, 'Coordinates')

  // Sheet 4: Area Computation
  const areaSheet = XLSX.utils.aoa_to_sheet([
    ['AREA COMPUTATION'],
    ['Method: Shoelace Formula (Coordinate Method)'],
    [''],
    ['PARCEL SUMMARY'],
    ['Area (sq metres)', pkg.parcel.areaM2.toFixed(4), 'm²'],
    ['Area (hectares)', (pkg.parcel.areaM2 / 10000).toFixed(6), 'Ha'],
    ['Area (acres)', (pkg.parcel.areaM2 / 4046.8564224).toFixed(4), 'ac'],
    ['Perimeter', pkg.parcel.perimeterM.toFixed(4), 'm'],
    [''],
    ['BEACON LIST'],
    ['No.', 'Beacon', 'Easting', 'Northing'],
    ...pkg.traverse.points.map((pt, i) => [
      i + 1,
      pt.pointName,
      pt.adjustedEasting.toFixed(4),
      pt.adjustedNorthing.toFixed(4)
    ])
  ])
  XLSX.utils.book_append_sheet(wb, areaSheet, 'Area Computation')

  // Sheet 5: Index to Computations
  const indexSheet = XLSX.utils.aoa_to_sheet([
    ['INDEX TO COMPUTATIONS'],
    [''],
    ['Sheet No.', 'Description', 'Page'],
    ['1', 'Project Details', '-'],
    ['2', 'Traverse Computation', '-'],
    ['3', 'Final Coordinates', '-'],
    ['4', 'Area Computation', '-'],
    ['5', 'Index to Computations', '-'],
    ['6', 'Theoretical Computations', '-'],
    ['7', 'Consistency Checks', '-'],
    ['8', 'Supporting Documents', '-'],
    [''],
    ['Certified Correct:'],
    ['Signature', ''],
    ['Date', ''],
    ['Surveyor Name', pkg.surveyor.fullName],
  ])
  XLSX.utils.book_append_sheet(wb, indexSheet, 'Index')

  // Sheet 6: Theoretical Computations
  const theoSheet = XLSX.utils.aoa_to_sheet([
    ['THEORETICAL COMPUTATIONS'],
    [''],
    ['LINEAR MEASUREMENTS'],
    ['Total perimeter computed from adjusted coordinates', pkg.traverse.perimeterM.toFixed(4), 'm'],
    [''],
    ['ANGULAR MEASUREMENTS'],
    ['Number of stations', pkg.traverse.points.length.toString()],
    ['Sum of observed angles (calculated)', ''],
    ['Theoretical sum ((n-2) × 180°)', ((pkg.traverse.points.length - 2) * 180).toFixed(0), '°'],
    ['Angular misclosure', pkg.traverse.angularMisclosure.toFixed(4), '"'],
    [''],
    ['PRECISION'],
    ['Precision ratio', pkg.traverse.precisionRatio],
    ['Required for cadastral', '1:5000'],
  ])
  XLSX.utils.book_append_sheet(wb, theoSheet, 'Theoretical Comps')

  // Sheet 7: Consistency Checks
  const consistencyCheckRows = pkg.traverse.points.slice(0, -1).map((pt, i) => {
    const next = pkg.traverse.points[i + 1]
    const calcDist = Math.sqrt(
      Math.pow(next.adjustedEasting - pt.adjustedEasting, 2) +
      Math.pow(next.adjustedNorthing - pt.adjustedNorthing, 2)
    )
    const obsDist = (pt.observedDistance + next.observedDistance) / 2
    const diff = Math.abs(calcDist - obsDist)
    return [
      `Line ${pt.pointName}-${next.pointName}`,
      calcDist.toFixed(4),
      obsDist.toFixed(4),
      diff.toFixed(4),
      diff < 0.05 ? 'PASS' : 'CHECK'
    ]
  })

  const consistencySheet = XLSX.utils.aoa_to_sheet([
    ['CONSISTENCY CHECKS'],
    [''],
    ['CHECK 1: Raw vs Adjusted'],
    ['Point', 'Raw Distance', 'Adjusted Distance', 'Difference', 'Status'],
    ...pkg.traverse.points.slice(0, -1).map((pt, i) => {
      const next = pkg.traverse.points[i + 1]
      const rawDist = pt.observedDistance
      const adjDist = Math.sqrt(
        Math.pow(next.adjustedEasting - pt.adjustedEasting, 2) +
        Math.pow(next.adjustedNorthing - pt.adjustedNorthing, 2)
      )
      return [
        `${pt.pointName}-${next.pointName}`,
        rawDist.toFixed(4),
        adjDist.toFixed(4),
        Math.abs(adjDist - rawDist).toFixed(4),
        Math.abs(adjDist - rawDist) < 0.05 ? 'PASS' : 'CHECK'
      ]
    }),
    [''],
    ['CHECK 2: Closure'],
    ['Expected perimeter', pkg.traverse.perimeterM.toFixed(4), 'm'],
    ['Computed from adjusted', '', 'm'],
    ['Closure error (should be ~0)', pkg.traverse.linearMisclosure.toFixed(4), 'm'],
  ])
  XLSX.utils.book_append_sheet(wb, consistencySheet, 'Consistency Checks')

  // Sheet 8: Supporting Documents
  const supportingDocsRows = pkg.supportingDocs.map(doc => [
    doc.type?.toUpperCase() || doc.label,
    doc.required ? 'Required' : 'Optional',
    doc.fileUrl ? 'Attached' : 'Not Uploaded'
  ])

  const supportSheet = XLSX.utils.aoa_to_sheet([
    ['SUPPORTING DOCUMENTS'],
    [''],
    ['Document Type', 'Status', 'File'],
    ...supportingDocsRows,
    [''],
    ['REQUIRED FOR SUBMISSION:'],
    ['PPA2 - Physical Planning Approval', 'Required'],
    ['LCB Consent - Land Control Board', 'Required'],
    ['Mutation Form / Subdivision Scheme', 'Required'],
  ])
  XLSX.utils.book_append_sheet(wb, supportSheet, 'Supporting Docs')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
