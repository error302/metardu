/** Metric survey vectors in UTF-8 AutoCAD 2007 DXF (AC1021). Raster imagery is not embedded. */
import Drawing from 'dxf-writer'
import type { CADDocument } from './CADEditor'
import { prepareCadSurveyExport } from '@/lib/cad/cadExportValidation'
import { cadCanvasToProject } from '@/lib/cad/projectCadDocument'

// TEXT is a single-line value. Never permit user text to become group-code lines.
function singleLine(value: string): string { return value.replace(/[\u0000-\u001f\u007f]/g, ' ') }

export function generateCADDocumentDXF(document: CADDocument): string {
  const doc = prepareCadSurveyExport(document)
  const drawing = new Drawing()
  drawing.setUnits('Meters')
  drawing.header('LUPREC', [[70, 4]])
  drawing.header('AUPREC', [[70, 2]])
  drawing.header('PDMODE', [[70, 35]])
  drawing.header('PDSIZE', [[40, 1]])
  for (const [name, color] of [['BOUNDARY', 1], ['BEACONS', 3], ['LABELS', 2], ['ANNOTATIONS', 7], ['TITLE_BLOCK', 7], ['CARTOGRAPHY', 7]] as const) drawing.addLayer(name, color, 'CONTINUOUS')
  const world = (x: number, y: number) => cadCanvasToProject(x, y, doc.originEasting, doc.originNorthing, doc.height, doc.metersPerPixel)
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => { drawing.setActiveLayer(layer).drawLine(x1, y1, x2, y2) }
  const text = (layer: string, x: number, y: number, value: string, height = 1, angle = 0) => {
    if (value) drawing.setActiveLayer(layer).drawText(x, y, height, angle, singleLine(value))
  }
  for (const point of doc.beacons) {
    const p = point
    drawing.setActiveLayer('BEACONS').drawPoint(p.easting, p.northing)
    text('LABELS', p.easting + 0.5, p.northing + 0.5, point.label, 1.2)
  }
  const points = new Map(doc.beacons.map(point => [point.id, point]))
  for (const edge of doc.boundaries) {
    const from = points.get(edge.fromId); const to = points.get(edge.toId)
    if (!from || !to) throw new RangeError('Boundary endpoint missing from the drawing.')
    const a = from; const b = to
    line('BOUNDARY', a.easting, a.northing, b.easting, b.northing)
    const mx = (a.easting + b.easting) / 2; const my = (a.northing + b.northing) / 2
    const angle = Math.atan2(b.northing - a.northing, b.easting - a.easting) * 180 / Math.PI
    const readableAngle = angle > 90 || angle < -90 ? angle + 180 : angle
    text('LABELS', mx, my, `${edge.bearing}  ${edge.distance}m`, 0.9, readableAngle)
    if (edge.roadLabel) text('LABELS', mx, my - 1.2, edge.roadLabel, 0.8, readableAngle)
  }
  for (const annotation of doc.annotations) {
    const a = world(annotation.x, annotation.y)
    if (annotation.type === 'text' && annotation.text) text('ANNOTATIONS', a.easting, a.northing, annotation.text, (annotation.fontSize ?? 10) * doc.metersPerPixel)
    else if (annotation.type === 'line') {
      if (annotation.x2 === undefined || annotation.y2 === undefined) throw new RangeError('A line annotation needs both endpoints before export.')
      const b = world(annotation.x2, annotation.y2)
      line('ANNOTATIONS', a.easting, a.northing, b.easting, b.northing)
    }
  }
  const arrow = doc.northArrow; const rotation = arrow.rotation * Math.PI / 180
  const arrowPoint = (x: number, y: number) => world(arrow.x + x * Math.cos(rotation) - y * Math.sin(rotation), arrow.y + x * Math.sin(rotation) + y * Math.cos(rotation))
  const tail = arrowPoint(0, 25); const tip = arrowPoint(0, -25)
  line('CARTOGRAPHY', tail.easting, tail.northing, tip.easting, tip.northing)
  for (const x of [-4, 4]) { const head = arrowPoint(x, -8); line('CARTOGRAPHY', head.easting, head.northing, tip.easting, tip.northing) }
  const northLabel = arrowPoint(0, -30)
  text('CARTOGRAPHY', northLabel.easting, northLabel.northing, `N (${arrow.type.toUpperCase()})`, 10 * doc.metersPerPixel)
  if (doc.scaleBar.scaleMeters > 0) {
    const start = world(doc.scaleBar.x, doc.scaleBar.y)
    line('CARTOGRAPHY', start.easting, start.northing, start.easting + doc.scaleBar.scaleMeters, start.northing)
    for (const fraction of [0, 0.5, 1]) { const x = start.easting + fraction * doc.scaleBar.scaleMeters; line('CARTOGRAPHY', x, start.northing - 4 * doc.metersPerPixel, x, start.northing + 4 * doc.metersPerPixel) }
    text('CARTOGRAPHY', start.easting, start.northing + 7 * doc.metersPerPixel, `${doc.scaleBar.scaleMeters} m (grid)`, 8 * doc.metersPerPixel)
  }
  const title = world(doc.width - 280, doc.height - 10)
  drawing.setActiveLayer('TITLE_BLOCK').drawRect(title.easting, title.northing, title.easting + 270 * doc.metersPerPixel, title.northing + 100 * doc.metersPerPixel)
  const titles = [doc.titleBlock.projectName, `LR: ${doc.titleBlock.lrNumber}`, `Surveyor: ${doc.titleBlock.surveyor} | Reg: ${doc.titleBlock.regNo}`,
    `CRS: ${doc.coordinateReferenceSystem} | Units: metres`, `Date: ${doc.titleBlock.date} | Sheet: ${doc.titleBlock.sheet}`,
    'DRAFT — NOT CERTIFIED; verify print scale and survey accuracy', ...(doc.backgroundImage?.visible ? ['Vector export; raster imagery is not embedded'] : [])]
  titles.forEach((value, index) => text('TITLE_BLOCK', title.easting + 8 * doc.metersPerPixel, title.northing + (90 - index * 12) * doc.metersPerPixel, value, 7 * doc.metersPerPixel))
  return drawing.toDxfString().replace('0\nENDSEC', `999\nMETARDU_CRS=${doc.coordinateReferenceSystem}\n0\nENDSEC`)
}
