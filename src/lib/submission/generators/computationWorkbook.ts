import * as XLSX from 'xlsx'
import type { SubmissionPackage } from '../types'

export function generateComputationWorkbook(pkg: SubmissionPackage): Buffer {
  const wb = XLSX.utils.book_new()

  const projectSheet = XLSX.utils.aoa_to_sheet([
    ['METARDU COMPUTATION WORKBOOK'],
    [''],
    ['Submission Reference', pkg.submissionRef],
    ['LR Number', pkg.parcel.lrNumber],
    ['County', pkg.parcel.county],
    ['District', pkg.parcel.district],
    ['Locality', pkg.parcel.locality],
    ['Survey Type', pkg.subtype],
    [''],
    ['Surveyor', pkg.surveyor.fullName],
    ['Registration No.', pkg.surveyor.registrationNumber],
    ['Firm', pkg.surveyor.firmName],
    ['Date Generated', new Date(pkg.generatedAt).toLocaleDateString('en-KE')],
  ])
  XLSX.utils.book_append_sheet(wb, projectSheet, 'Project Details')

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
    ['TRAVERSE COMPUTATION — BOWDITCH ADJUSTMENT'],
    [''],
    traverseHeaders,
    ...traverseRows,
    [],
    ['CLOSURE SUMMARY'],
    ['Angular Misclosure', pkg.traverse.angularMisclosure.toFixed(4), 'seconds'],
    ['Linear Misclosure', pkg.traverse.linearMisclosure.toFixed(4), 'm'],
    ['Precision Ratio', pkg.traverse.precisionRatio],
    ['Closing Error E', pkg.traverse.closingErrorE.toFixed(4), 'm'],
    ['Closing Error N', pkg.traverse.closingErrorN.toFixed(4), 'm'],
    [],
    ['PARCEL SUMMARY'],
    ['Area', pkg.parcel.areaM2.toFixed(4), 'm²'],
    ['Area', (pkg.parcel.areaM2 / 10000).toFixed(6), 'Ha'],
    ['Perimeter', pkg.parcel.perimeterM.toFixed(4), 'm'],
  ])
  XLSX.utils.book_append_sheet(wb, traverseSheet, 'Traverse Computation')

  const coordHeaders = ['Point', 'Easting (m)', 'Northing (m)', 'Type']
  const coordRows = pkg.traverse.points.map(pt => [
    pt.pointName,
    pt.adjustedEasting.toFixed(4),
    pt.adjustedNorthing.toFixed(4),
    'Beacon'
  ])

  const coordSheet = XLSX.utils.aoa_to_sheet([
    ['FINAL ADJUSTED COORDINATES'],
    ['Coordinate System: Arc 1960 / UTM Zone 37S (SRID: 21037)'],
    [''],
    coordHeaders,
    ...coordRows
  ])
  XLSX.utils.book_append_sheet(wb, coordSheet, 'Coordinates')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}
