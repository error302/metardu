import { contourLabelMidpoint, type ContourLine, type SpotHeight } from '@/lib/engine/contours'
import type { Bounds } from './types'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { formatContourHeight } from './helpers'

export interface ContourExportMetadata {
  title: string
  horizontalCrs: string
  verticalDatum: string
  contourInterval: number
  heightsInMetres: boolean
}

export function validateContourExportReference(metadata: ContourExportMetadata): void {
  const code = metadata.horizontalCrs.trim().split('/')[0].trim()
  if (!code) throw new RangeError('Enter a registered projected metre CRS (EPSG code) in Settings before exporting.')
  const crs = assertProjectedCrs(code)
  if (crs.units !== 'metres') throw new RangeError('Contour exports require a projected metre CRS; source coordinates are not converted.')
  if (!metadata.verticalDatum.trim()) throw new RangeError('Record the vertical datum or site benchmark in Settings before exporting.')
  if (metadata.heightsInMetres !== true) throw new RangeError('Confirm that source heights are in metres in Settings before exporting. No unit conversion is applied.')
  if (!Number.isFinite(metadata.contourInterval) || metadata.contourInterval <= 0) throw new RangeError('The contour interval must be finite and positive.')
}

export function contourExportReferenceIssue(metadata: ContourExportMetadata): string | null {
  try { validateContourExportReference(metadata); return null }
  catch (error) { return error instanceof Error ? error.message : 'Complete the source reference before exporting.' }
}

function validateContours(contours: ContourLine[], metadata: ContourExportMetadata, bounds?: Bounds, points: SpotHeight[] = []): void {
  validateContourExportReference(metadata)
  if (bounds && (![bounds.minE, bounds.maxE, bounds.minN, bounds.maxN, bounds.minZ, bounds.maxZ].every(Number.isFinite)
    || !Number.isFinite(bounds.maxE - bounds.minE) || !Number.isFinite(bounds.maxN - bounds.minN)
    || bounds.maxE <= bounds.minE || bounds.maxN <= bounds.minN || bounds.maxZ < bounds.minZ)) throw new RangeError('Export bounds must be finite and ordered with positive horizontal extents.')
  for (const contour of contours) {
    if (!Number.isFinite(contour.elevation) || contour.points.length < 2
      || contour.points.some(point => !Number.isFinite(point.easting) || !Number.isFinite(point.northing))) throw new RangeError('Every contour needs a finite elevation and at least two finite coordinate pairs; invalid measurements are not replaced with zero.')
  }
  for (const point of points) if (![point.easting, point.northing, point.elevation].every(Number.isFinite)) throw new RangeError('Source spot coordinates and heights must be finite.')
}

function clean(value: string): string {
  return value.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120)
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }
  return value.replace(/[&<>"']/g, char => entities[char] ?? char)
}

function numberTag(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Export coordinates must be finite; invalid measurements are not replaced with zero.')
  return String(value)
}

function niceScaleStep(maximum: number): number {
  if (!Number.isFinite(maximum) || !(maximum > 0)) throw new RangeError('The bounds are too small for a readable scale bar.')
  const power = 10 ** Math.floor(Math.log10(maximum))
  const normalized = maximum / power
  const nice = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1
  const result = nice * power
  if (!Number.isFinite(result) || result <= 0) throw new RangeError('The bounds are too small for a readable scale bar.')
  return result
}

function fitMap(bounds: Bounds, x: number, y: number, width: number, height: number) {
  const rangeE = bounds.maxE - bounds.minE
  const rangeN = bounds.maxN - bounds.minN
  const scale = Math.min(width / rangeE, height / rangeN)
  const plotWidth = rangeE * scale
  const plotHeight = rangeN * scale
  if (![scale, plotWidth, plotHeight].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('The bounds cannot form a finite readable map scale.')
  const plotX = x + (width - plotWidth) / 2
  const plotY = y + (height - plotHeight) / 2
  return {
    scale,
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    toX: (e: number) => plotX + (e - bounds.minE) * scale,
    toY: (n: number) => plotY + (bounds.maxN - n) * scale,
  }
}

function contourLayer(elevation: number): string {
  return `C${String(elevation).replaceAll('-', 'M').replaceAll('.', '_').replaceAll('+', 'P')}`
}

/** DXF 2007 UTF-8 output; each polyline retains its contour elevation in group 38. */
export function generateDXF(
  contours: ContourLine[],
  bounds: Bounds,
  metadata: ContourExportMetadata,
): string {
  validateContours(contours, metadata, bounds)
  const uniqueElevations = [...new Set(contours.map(contour => contour.elevation))].sort((a, b) => a - b)
  const indexElevations = new Set(contours.filter(contour => contour.isIndex).map(contour => contour.elevation))
  const minZ = uniqueElevations[0] ?? bounds.minZ
  const maxZ = uniqueElevations.at(-1) ?? bounds.maxZ
  const lines: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1021',
    '9', '$INSUNITS', '70', '6',
    '9', '$MEASUREMENT', '70', '1',
    '9', '$EXTMIN', '10', numberTag(bounds.minE), '20', numberTag(bounds.minN), '30', numberTag(minZ),
    '9', '$EXTMAX', '10', numberTag(bounds.maxE), '20', numberTag(bounds.maxN), '30', numberTag(maxZ),
    '0', 'ENDSEC',
    '999', `METARDU horizontal CRS: ${clean(metadata.horizontalCrs)}`,
    '999', `METARDU vertical datum: ${clean(metadata.verticalDatum)}`,
    '999', `METARDU contour interval: ${metadata.contourInterval} m; coordinates exported in metres`,
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '5', '1', '330', '0', '100', 'AcDbSymbolTable', '70', String(uniqueElevations.length),
  ]

  for (const elevation of uniqueElevations) {
    lines.push('0', 'LAYER', '100', 'AcDbSymbolTableRecord', '100', 'AcDbLayerTableRecord', '2', contourLayer(elevation), '70', '0', '62', '7', '6', 'CONTINUOUS', '370', indexElevations.has(elevation) ? '50' : '15')
  }
  lines.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES')

  for (const contour of contours) {
    if (contour.points.length < 2) continue
    const last = contour.points.at(-1)
    const closed = contour.points.length > 2 && last != null &&
      contour.points[0].easting === last.easting &&
      contour.points[0].northing === last.northing
    lines.push(
      '0', 'LWPOLYLINE', '100', 'AcDbEntity', '8', contourLayer(contour.elevation), '100', 'AcDbPolyline', '90', String(contour.points.length),
      '70', closed ? '1' : '0', '38', numberTag(contour.elevation),
    )
    for (const point of contour.points) lines.push('10', numberTag(point.easting), '20', numberTag(point.northing))
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\r\n')
}

/** A3 landscape, print-ready vector map with a true equal-unit map frame and explicit provenance. */
export async function generateContourPDF(
  contours: ContourLine[],
  bounds: Bounds,
  points: SpotHeight[],
  metadata: ContourExportMetadata,
): Promise<Blob> {
  validateContours(contours, metadata, bounds, points)
  // PDF is an explicit export action; keep jsPDF out of the contour tool's
  // initial route chunk while the established engine owns all calculations.
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const title = clean(metadata.title) || 'Topographic Contour Plan'
  const crs = clean(metadata.horizontalCrs)
  const verticalDatum = clean(metadata.verticalDatum)
  pdf.setProperties({ title, subject: `Contour interval ${metadata.contourInterval} m; source CRS ${crs}`, creator: 'METARDU Survey Platform' })
  pdf.setFillColor(255, 255, 255)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setTextColor(20, 32, 44)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(title, 16, 17)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(76, 91, 105)
  pdf.text('DRAFT TOPOGRAPHIC CONTOUR PLAN  /  A3 LANDSCAPE', 16, 23)
  pdf.text(`Prepared ${new Date().toLocaleDateString('en-GB')}`, pageWidth - 16, 17, { align: 'right' })

  const frame = { x: 16, y: 31, w: 318, h: 215 }
  const map = fitMap(bounds, frame.x + 7, frame.y + 7, frame.w - 14, frame.h - 20)
  pdf.setDrawColor(105, 119, 132)
  pdf.setLineWidth(0.25)
  pdf.rect(frame.x, frame.y, frame.w, frame.h)
  pdf.setFillColor(255, 255, 255)
  pdf.rect(map.plotX, map.plotY, map.plotWidth, map.plotHeight, 'F')

  // Coordinate graticule and numeric edge labels follow actual projected coordinates.
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.setTextColor(74, 85, 97)
  pdf.setDrawColor(222, 227, 232)
  for (let i = 0; i <= 5; i++) {
    const easting = bounds.minE + (bounds.maxE - bounds.minE) * i / 5
    const x = map.toX(easting)
    pdf.line(x, map.plotY, x, map.plotY + map.plotHeight)
    pdf.text(easting.toFixed(0), x, Math.min(frame.y + frame.h - 3, map.plotY + map.plotHeight + 5), { align: 'center' })
    const northing = bounds.minN + (bounds.maxN - bounds.minN) * i / 5
    const y = map.toY(northing)
    pdf.line(map.plotX, y, map.plotX + map.plotWidth, y)
    pdf.text(northing.toFixed(0), map.plotX - 2, y + 1.2, { align: 'right' })
  }

  // Regular contours are fine brown lines; index contours are heavier and labelled.
  for (const contour of contours) {
    if (contour.points.length < 2) continue
    if (contour.isIndex) {
      pdf.setDrawColor(112, 65, 30)
      pdf.setTextColor(96, 53, 24)
      pdf.setLineWidth(0.42)
    } else {
      pdf.setDrawColor(151, 112, 74)
      pdf.setTextColor(105, 83, 60)
      pdf.setLineWidth(0.16)
    }
    for (let index = 1; index < contour.points.length; index++) {
      const previous = contour.points[index - 1]
      const current = contour.points[index]
      pdf.line(map.toX(previous.easting), map.toY(previous.northing), map.toX(current.easting), map.toY(current.northing))
    }
    if (contour.isIndex) {
      const labelPoint = contourLabelMidpoint(contour)
      if (!labelPoint) continue
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      const text = `${formatContourHeight(contour.elevation)} m`
      const x = map.toX(labelPoint.easting), y = map.toY(labelPoint.northing) - 1
      const textWidth = pdf.getTextWidth(text)
      pdf.setFillColor(255, 255, 255)
      pdf.rect(x - textWidth / 2 - 0.6, y - 2.5, textWidth + 1.2, 3.2, 'F')
      pdf.text(text, x, y, { align: 'center' })
    }
  }

  const pointStep = Math.max(1, Math.ceil(points.length / 120))
  pdf.setDrawColor(35, 46, 57)
  pdf.setFillColor(35, 46, 57)
  for (let i = 0; i < points.length; i += pointStep) {
    const point = points[i]
    const x = map.toX(point.easting)
    const y = map.toY(point.northing)
    pdf.circle(x, y, 0.45, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5.5)
    pdf.setTextColor(47, 57, 67)
    pdf.text(`${clean(point.name)} ${point.elevation.toFixed(2)}`, x + 1, y - 1)
  }
  pdf.setDrawColor(65, 75, 85)
  pdf.setLineWidth(0.2)
  pdf.rect(map.plotX, map.plotY, map.plotWidth, map.plotHeight)

  // North arrow.
  const arrowX = frame.x + frame.w - 12
  const arrowY = frame.y + 20
  pdf.setDrawColor(30, 42, 54)
  pdf.setFillColor(30, 42, 54)
  pdf.setLineWidth(0.65)
  pdf.line(arrowX, arrowY + 7, arrowX, arrowY)
  pdf.triangle(arrowX, arrowY, arrowX - 2, arrowY + 4, arrowX + 2, arrowY + 4, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text('GRID N', arrowX, arrowY - 2, { align: 'center' })

  // Scale bar length is derived from the same metric fit used by the coordinate transform.
  const scaleMeters = niceScaleStep(Math.min(bounds.maxE - bounds.minE, bounds.maxN - bounds.minN) * 0.2)
  const scaleMm = scaleMeters * map.scale
  const scaleX = frame.x + frame.w - scaleMm - 15
  const scaleY = frame.y + frame.h - 9
  pdf.setDrawColor(35, 46, 57)
  pdf.setLineWidth(0.8)
  pdf.line(scaleX, scaleY, scaleX + scaleMm, scaleY)
  pdf.line(scaleX, scaleY - 1.5, scaleX, scaleY + 1.5)
  pdf.line(scaleX + scaleMm, scaleY - 1.5, scaleX + scaleMm, scaleY + 1.5)
  pdf.setFontSize(6.5)
  pdf.text('0', scaleX, scaleY - 2, { align: 'center' })
  pdf.text(`${scaleMeters.toLocaleString('en-GB')} m`, scaleX + scaleMm, scaleY - 2, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(70, 83, 95)
  pdf.text('Easting (m)', map.plotX + map.plotWidth / 2, frame.y + frame.h - 2, { align: 'center' })
  pdf.text('Northing (m)', frame.x + 2, frame.y + frame.h / 2, { angle: 90, align: 'center' })

  // Right-side map key and source metadata.
  const panelX = 343
  const panelW = pageWidth - panelX - 16
  pdf.setDrawColor(150, 160, 169)
  pdf.rect(panelX, frame.y, panelW, frame.h)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(25, 37, 49)
  pdf.text('MAP KEY', panelX + 6, frame.y + 9)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(56, 68, 80)
  pdf.setDrawColor(151, 112, 74)
  pdf.setLineWidth(0.2)
  pdf.line(panelX + 6, frame.y + 17, panelX + 17, frame.y + 17)
  pdf.text('Intermediate contour', panelX + 21, frame.y + 18)
  pdf.setDrawColor(112, 65, 30)
  pdf.setLineWidth(0.5)
  pdf.line(panelX + 6, frame.y + 24, panelX + 17, frame.y + 24)
  pdf.text('Index contour', panelX + 21, frame.y + 25)
  pdf.setFillColor(35, 46, 57)
  pdf.circle(panelX + 11.5, frame.y + 32, 0.55, 'F')
  pdf.text('Source spot height', panelX + 21, frame.y + 33)

  const metadataRows = [
    ['Contour interval', `${metadata.contourInterval} m`],
    ['Horizontal CRS', crs],
    ['Vertical datum', verticalDatum],
    ['Source points', String(points.length)],
    ['Contour lines', String(contours.length)],
    ['Elevation range', `${bounds.minZ.toFixed(2)} - ${bounds.maxZ.toFixed(2)} m`],
  ]
  let rowY = frame.y + 47
  for (const [label, value] of metadataRows) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6)
    pdf.setTextColor(73, 84, 95)
    pdf.text(label.toUpperCase(), panelX + 6, rowY)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(25, 37, 49)
    const wrapped = pdf.splitTextToSize(value, panelW - 12) as string[]
    pdf.text(wrapped, panelX + 6, rowY + 4)
    rowY += label === 'Horizontal CRS' && value.length > 36 ? 16 : 12
  }

  const footerY = 256
  pdf.setDrawColor(105, 119, 132)
  pdf.line(16, footerY, pageWidth - 16, footerY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.setTextColor(25, 37, 49)
  pdf.text('SURVEY QA REQUIRED', 16, footerY + 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.setTextColor(70, 83, 95)
  pdf.text(
    'Interpolated contours are a derived surface. Confirm coordinate reference system, vertical datum, source observations, breaklines, and project accuracy before issue or construction use.',
    16,
    footerY + 12,
    { maxWidth: pageWidth - 32 },
  )
  pdf.setFontSize(6)
  pdf.text('METARDU - working plan; not a cadastral submission or certification', pageWidth - 16, pageHeight - 8, { align: 'right' })
  return pdf.output('blob')
}

/** SVG copy of the print layout for editing in CAD and vector-graphics software. */
export function generateSVGExport(
  contours: ContourLine[],
  bounds: Bounds,
  points: SpotHeight[],
  metadata: ContourExportMetadata,
): string {
  validateContours(contours, metadata, bounds, points)
  const width = 1200
  const height = 840
  const plot = fitMap(bounds, 115, 130, 830, 570)
  const title = clean(metadata.title) || 'Topographic Contour Plan'
  const crs = clean(metadata.horizontalCrs)
  const verticalDatum = clean(metadata.verticalDatum)
  const svg: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 ${width} ${height}">`,
    '<rect width="1200" height="840" fill="#fff"/>',
    '<rect x="24" y="24" width="1152" height="792" fill="none" stroke="#25313d" stroke-width="1.5"/>',
    `<text x="40" y="57" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#192531">${escapeXml(title)}</text>`,
    '<text x="40" y="82" font-family="Arial,sans-serif" font-size="12" fill="#4b5b69">DRAFT TOPOGRAPHIC CONTOUR PLAN / A3 LANDSCAPE</text>',
    '<rect x="75" y="105" width="890" height="635" fill="#fff" stroke="#697784" stroke-width="1"/>',
    `<rect x="${plot.plotX}" y="${plot.plotY}" width="${plot.plotWidth}" height="${plot.plotHeight}" fill="#fff" stroke="#41505d" stroke-width="1"/>`,
  ]

  for (let i = 0; i <= 5; i++) {
    const easting = bounds.minE + (bounds.maxE - bounds.minE) * i / 5
    const x = plot.toX(easting)
    const northing = bounds.minN + (bounds.maxN - bounds.minN) * i / 5
    const y = plot.toY(northing)
    svg.push(`<line x1="${x}" y1="${plot.plotY}" x2="${x}" y2="${plot.plotY + plot.plotHeight}" stroke="#e0e5e9" stroke-width="0.7"/>`)
    svg.push(`<text x="${x}" y="${plot.plotY + plot.plotHeight + 19}" text-anchor="middle" font-family="monospace" font-size="10" fill="#4b5b69">${easting.toFixed(0)}</text>`)
    svg.push(`<line x1="${plot.plotX}" y1="${y}" x2="${plot.plotX + plot.plotWidth}" y2="${y}" stroke="#e0e5e9" stroke-width="0.7"/>`)
    svg.push(`<text x="${plot.plotX - 6}" y="${y + 3}" text-anchor="end" font-family="monospace" font-size="10" fill="#4b5b69">${northing.toFixed(0)}</text>`)
  }

  for (const contour of contours) {
    const coordinates = contour.points.map(point => `${plot.toX(point.easting).toFixed(2)},${plot.toY(point.northing).toFixed(2)}`).join(' ')
    const color = contour.isIndex ? '#70411e' : '#97704a'
    svg.push(`<polyline points="${coordinates}" fill="none" stroke="${color}" stroke-width="${contour.isIndex ? 2.2 : 0.9}" stroke-linejoin="round" stroke-linecap="round"/>`)
    if (contour.isIndex) {
      const point = contourLabelMidpoint(contour)
      if (!point) continue
      svg.push(`<text x="${plot.toX(point.easting)}" y="${plot.toY(point.northing) - 4}" fill="#603518" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700">${formatContourHeight(contour.elevation)} m</text>`)
    }
  }

  const pointStep = Math.max(1, Math.ceil(points.length / 120))
  for (let i = 0; i < points.length; i += pointStep) {
    const point = points[i]
    const x = plot.toX(point.easting)
    const y = plot.toY(point.northing)
    svg.push(`<circle cx="${x}" cy="${y}" r="2.1" fill="#25313d"/><text x="${x + 5}" y="${y - 4}" font-family="Arial,sans-serif" font-size="8" fill="#25313d">${escapeXml(clean(point.name))} ${point.elevation.toFixed(2)}</text>`)
  }

  const scaleMeters = niceScaleStep(Math.min(bounds.maxE - bounds.minE, bounds.maxN - bounds.minN) * 0.2)
  const scaleLength = scaleMeters * plot.scale
  const scaleX = plot.plotX + 8
  const scaleY = plot.plotY + plot.plotHeight - 12
  svg.push(`<line x1="${scaleX}" y1="${scaleY}" x2="${scaleX + scaleLength}" y2="${scaleY}" stroke="#25313d" stroke-width="2"/><line x1="${scaleX}" y1="${scaleY - 4}" x2="${scaleX}" y2="${scaleY + 4}" stroke="#25313d"/><line x1="${scaleX + scaleLength}" y1="${scaleY - 4}" x2="${scaleX + scaleLength}" y2="${scaleY + 4}" stroke="#25313d"/><text x="${scaleX}" y="${scaleY - 7}" font-family="Arial,sans-serif" font-size="10" fill="#25313d">0</text><text x="${scaleX + scaleLength}" y="${scaleY - 7}" text-anchor="end" font-family="Arial,sans-serif" font-size="10" fill="#25313d">${scaleMeters.toLocaleString('en-GB')} m</text>`)
  svg.push(`<text x="${plot.plotX + plot.plotWidth / 2}" y="${plot.plotY + plot.plotHeight + 32}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#425466">Easting (m)</text>`)
  svg.push(`<text x="85" y="${plot.plotY + plot.plotHeight / 2}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#425466" transform="rotate(-90 85 ${plot.plotY + plot.plotHeight / 2})">Northing (m)</text>`)

  const panelX = 985
  const entries = [
    ['CONTOUR INTERVAL', `${metadata.contourInterval} m`],
    ['HORIZONTAL CRS', crs],
    ['VERTICAL DATUM', verticalDatum],
    ['SOURCE POINTS', String(points.length)],
    ['CONTOUR LINES', String(contours.length)],
    ['ELEVATION RANGE', `${bounds.minZ.toFixed(2)} - ${bounds.maxZ.toFixed(2)} m`],
  ]
  svg.push(`<rect x="${panelX}" y="105" width="190" height="635" fill="#fff" stroke="#697784" stroke-width="1"/>`)
  svg.push(`<text x="${panelX + 16}" y="132" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#192531">MAP KEY</text>`)
  svg.push(`<line x1="${panelX + 16}" y1="153" x2="${panelX + 45}" y2="153" stroke="#97704a" stroke-width="1"/><text x="${panelX + 54}" y="157" font-family="Arial,sans-serif" font-size="10" fill="#374653">Intermediate</text>`)
  svg.push(`<line x1="${panelX + 16}" y1="174" x2="${panelX + 45}" y2="174" stroke="#70411e" stroke-width="2.4"/><text x="${panelX + 54}" y="178" font-family="Arial,sans-serif" font-size="10" fill="#374653">Index contour</text>`)
  let y = 209
  for (const [label, value] of entries) {
    svg.push(`<text x="${panelX + 16}" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#4b5b69">${label}</text>`)
    const words = escapeXml(value)
    svg.push(`<text x="${panelX + 16}" y="${y + 15}" font-family="Arial,sans-serif" font-size="10" fill="#192531">${words}</text>`)
    y += 50
  }
  svg.push('<text x="1080" y="619" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#192531">GRID N</text>')
  svg.push('<line x1="1080" y1="627" x2="1080" y2="654" stroke="#192531" stroke-width="2"/><path d="M1080 623l-6 11h12z" fill="#192531"/>')
  svg.push(`<text x="40" y="775" font-family="Arial,sans-serif" font-size="10" fill="#4b5b69">Generated ${escapeXml(new Date().toLocaleDateString('en-GB'))}. Coordinates in metres. Verify CRS, datum, accuracy, source observations, and design requirements before issue.</text>`)
  svg.push('<text x="40" y="795" font-family="Arial,sans-serif" font-size="9" fill="#4b5b69">METARDU working plan - not a cadastral submission or certification</text>')
  svg.push('</svg>')
  return svg.join('\n')
}

export function generateContourCSV(contours: ContourLine[], metadata: ContourExportMetadata): string {
  validateContours(contours, metadata)
  const fields = [clean(metadata.horizontalCrs), clean(metadata.verticalDatum)].map(value => /^[=+\-@]/.test(value) ? "'" + value : value)
  const rows = ['contour_id,elevation_m,is_index,point_index,easting_m,northing_m,horizontal_crs,vertical_datum']
  let contourId = 0
  for (const contour of contours) {
    contourId++
    for (let index = 0; index < contour.points.length; index++) {
      const point = contour.points[index]
      rows.push(`${contourId},${numberTag(contour.elevation)},${contour.isIndex},${index},${numberTag(point.easting)},${numberTag(point.northing)},"${fields[0].replaceAll('"', '""')}","${fields[1].replaceAll('"', '""')}"`)
    }
  }
  return rows.join('\n')
}
