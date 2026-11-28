import type { NamedPoint2D } from '@/lib/engine/types'
import { CONTROL, CRS, metres, ratio, type SampleTraverse } from './survey'

const WATERMARK = 'SYNTHETIC PRACTICE SAMPLE - NOT FOR SUBMISSION'
const FILE_PREFIX = 'METARDU_Sample_Parcel_01'

export function coordinateCsv(points: NamedPoint2D[]) {
  const header = 'Station,Easting_m,Northing_m,CRS,Status'
  return [header, ...points.map(point =>
    `${point.name},${metres(point.easting)},${metres(point.northing)},${CRS},${WATERMARK}`
  )].join('\r\n') + '\r\n'
}

export async function exportSample(format: 'csv' | 'dxf' | 'pdf', survey: SampleTraverse) {
  if (!survey.adjustment || !survey.area) throw new Error('Review the passing traverse first.')
  const { points, area, raw } = survey
  if (format === 'csv') {
    const { downloadBlob } = await import('@/lib/field/export')
    downloadBlob(coordinateCsv(points), `${FILE_PREFIX}_Coordinates.csv`, 'text/csv;charset=utf-8')
    return
  }

  if (format === 'dxf') {
    const [{ default: Drawing }, { downloadBlob }] = await Promise.all([
      import('dxf-writer'),
      import('@/lib/field/export'),
    ])
    const drawing = new Drawing()
    drawing.setUnits('Meters')
    drawing.addLayer('BOUNDARY', Drawing.ACI.GREEN, 'CONTINUOUS')
    drawing.addLayer('BEACONS', Drawing.ACI.WHITE, 'CONTINUOUS')
    drawing.addLayer('SAMPLE_NOTES', Drawing.ACI.YELLOW, 'CONTINUOUS')
    drawing.setActiveLayer('BOUNDARY')
    drawing.drawPolyline(points.map(point => [point.easting, point.northing]), true)
    drawing.setActiveLayer('BEACONS')
    for (const point of points) {
      drawing.drawPoint(point.easting, point.northing)
      drawing.drawText(point.easting + 2, point.northing + 2, 2.5, 0, point.name)
    }
    drawing.setActiveLayer('SAMPLE_NOTES')
    drawing.drawText(CONTROL.easting - 24, CONTROL.northing - 201, 4, 0, WATERMARK)
    drawing.drawText(CONTROL.easting - 24, CONTROL.northing - 208, 3, 0, CRS)
    downloadBlob(drawing.toDxfString(), `${FILE_PREFIX}_Boundary.dxf`, 'application/dxf')
    return
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  doc.setProperties({ title: 'METARDU | Sample Parcel 01', subject: WATERMARK })
  doc.setTextColor('#153832').setFontSize(11).text('METARDU  /  PRACTICE SURVEY', 16, 20)
  doc.setFontSize(25).text('Sample Parcel 01', 16, 33)
  doc.setFontSize(10).text(CRS, 16, 41)
  doc.setTextColor('#805623').text(WATERMARK, 16, 48)
  doc.setDrawColor('#a9bfba').rect(16, 55, 178, 145)

  // At 1:2,000, one ground metre is 0.5 mm on the printed sheet.
  const xy = (point: NamedPoint2D): [number, number] => [
    59 + (point.easting - CONTROL.easting) / 2,
    83 - (point.northing - CONTROL.northing) / 2,
  ]
  doc.setDrawColor('#126453').setLineWidth(0.45)
  points.forEach((point, i) => {
    const [x, y] = xy(point)
    doc.line(x, y, ...xy(points[(i + 1) % points.length]))
  })
  doc.setFontSize(8).setTextColor('#153832').setFillColor('#126453')
  points.forEach(point => {
    const [x, y] = xy(point)
    doc.circle(x, y, 1.1, 'F')
    doc.text(point.name, x + 2.3, y - 2)
  })
  doc.text('N', 179, 67, { align: 'center' })
  doc.line(179, 70, 179, 80)
  doc.line(179, 70, 177, 73)
  doc.line(179, 70, 181, 73)
  doc.line(25, 188, 50, 188)
  doc.line(25, 186.5, 25, 189.5)
  doc.line(50, 186.5, 50, 189.5)
  doc.text('0', 25, 194)
  doc.text('50 m', 50, 194, { align: 'right' })
  doc.text('1:2,000 at actual print size', 186, 194, { align: 'right' })

  doc.setFontSize(12).text('Coordinate schedule', 16, 211)
  doc.setFontSize(9).text('Station', 16, 219)
  doc.text('Easting (m)', 49, 219)
  doc.text('Northing (m)', 90, 219)
  points.forEach((point, index) => {
    const y = 226 + index * 5.5
    doc.text(point.name, 16, y)
    doc.text(metres(point.easting), 49, y)
    doc.text(metres(point.northing), 90, y)
  })
  doc.text(`Adjusted area: ${area.areaHa.toFixed(4)} ha`, 131, 226)
  doc.text(`Observed length: ${metres(raw.totalDistance)} m`, 131, 231.5)
  doc.text(`Linear misclosure: ${metres(survey.misclosure)} m`, 131, 237)
  doc.text(`Relative precision: ${ratio(survey.precision)}`, 131, 242.5)
  doc.text('Adjustment: Bowditch', 131, 248)
  doc.setFontSize(8).text('Horizontal grid observations only. Angular closure and elevations were not evaluated.', 16, 265)
  doc.setTextColor('#805623').text(WATERMARK, 16, 279)
  doc.save(`${FILE_PREFIX}_Practice_Plan.pdf`)
}
