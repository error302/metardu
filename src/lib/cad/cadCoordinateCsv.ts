import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { validateCadExportDocument } from './cadExportValidation'
import { hasCadReferenceFrame } from './cadReferenceFrame'

/** Formula-like spreadsheet text gets a leading tab; original identifiers stay in the CAD document. */
function textCell(value: string): string {
  const protectedValue = /^[\s\u0000]*[=+\-@＝＋－＠]/u.test(value) || /^[\t\r\n\u0000]/.test(value) ? `\t${value}` : value
  return `"${protectedValue.replace(/"/g, '""')}"`
}

export function generateCadCoordinateCsv(document: CADDocument): string {
  const doc = validateCadExportDocument(document)
  const crs = doc.coordinateReferenceSystem ?? ''
  const reference = hasCadReferenceFrame(doc) ? 'Declared grid (draft)' : crs ? 'Declared CRS; layout incomplete' : 'Unreferenced draft'
  const rows = ['Beacon,Easting,Northing,Symbol,CRS,Units,Reference']
  for (const point of doc.beacons) {
    rows.push([textCell(point.label), point.easting?.toFixed(3) ?? '', point.northing?.toFixed(3) ?? '',
      textCell(point.symbol ?? 'beacon'), textCell(crs), textCell(crs ? 'metres' : 'unknown'),
      textCell(point.easting === undefined ? 'No coordinates' : reference)].join(','))
  }
  return rows.join('\r\n')
}
