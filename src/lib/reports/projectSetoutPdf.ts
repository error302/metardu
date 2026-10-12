import { createSurveyDocument } from '@/lib/documents/pdf-engine'
import { prepareProjectSetoutReport, type ProjectSetoutReportOptions } from './projectSetoutHtml'
import type { SavedShotRow } from './projectSetoutCsv'
import type { StakeoutPointResult, StakeoutReportResult } from './stakeoutCutSheet'
import { createHash } from 'node:crypto'
import fontCoverage from '../../../public/fonts/JetBrainsMono-coverage.json'

export const MAX_SETOUT_PDF_SHOTS = 1000
export const SETOUT_PDF_FONT_FILE = 'JetBrainsMono-Regular.ttf'
const supportedCodePoints = new Set(fontCoverage.codePoints)
export class UnsupportedSetoutPdfTextError extends RangeError {
  constructor() { super('The PDF font cannot represent one or more saved characters. Download HTML or CSV to preserve the original text.'); this.name = 'UnsupportedSetoutPdfTextError' }
}

/** Native vector report. No browser process, external fonts, URLs or customer file paths. */
export async function generateProjectSetoutPdf(rows: SavedShotRow[], options: ProjectSetoutReportOptions & {
  logo: Buffer; font: Buffer;
}): Promise<Buffer> {
  if (rows.length > MAX_SETOUT_PDF_SHOTS) throw new RangeError('PDF reports support up to 1,000 saved shots; select a narrower design revision.')
  if (createHash('sha256').update(options.font).digest('hex') !== fontCoverage.fontSha256) throw new Error('The report font does not match its verified glyph coverage.')
  const { first, reports, legacy } = prepareProjectSetoutReport(rows, options)
  const created = new Date().toISOString()
  const doc = createSurveyDocument({ paperSize: 'A4', orientation: 'landscape', scale: 1, bufferPages: true,
    metadata: { title: `DRAFT saved set-out history - ${first.definition_name}`, surveyorName: 'Not provided',
      surveyorLicense: 'Not provided', projectReference: first.project_id, date: created.slice(0, 10) } })
  doc.registerFont('report', options.font).font('report')
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  const margin = 28.346, width = doc.page.width - margin * 2, bottom = doc.page.height - 64
  let y = margin, activeReport: StakeoutReportResult | null = null, activePoint = ''
  const clean = (value: unknown) => String(value ?? '').replace(/[\u2010-\u2015\u2212]/g, '-').replaceAll('·', ' | ')
  const logoSource = 'data:image/png;base64,' + options.logo.toString('base64')
  const text = (value: unknown, x: number, top: number, size: number, cellWidth = width, color = '#181818') => {
    const content = clean(value)
    for (const character of content) {
      const point = character.codePointAt(0)
      if (point != null && ![9, 10, 13].includes(point) && !supportedCodePoints.has(point)) throw new UnsupportedSetoutPdfTextError()
    }
    doc.font('report').fontSize(size).fillColor(color).text(content, x, top, { width: cellWidth, lineGap: 2 })
  }
  const header = () => {
    doc.image(logoSource, margin, margin, { width: 28, height: 28 })
    text('DRAFT - SAVED SET-OUT HISTORY', margin + 39, margin, 15, width - 39)
    text(first.definition_name, margin + 39, margin + 23, 9, width - 39)
    text(`Project ${first.project_id} | Definition ${first.definition_id}`, margin, margin + 42, 7.3)
    text(`${options.revision == null ? 'All saved design revisions' : `Selected design revision R${options.revision}`} | ${rows.length} saved shots | Generated UTC ${created}`, margin, margin + 54, 7.3)
    doc.moveTo(margin, margin + 70).lineTo(margin + width, margin + 70).lineWidth(0.7).strokeColor('#92713b').stroke()
    y = margin + 78
  }
  const columns = [65, 80, 80, 60, 80, 80, 60, 48, 48, 48, 62, 69].map(v => v * width / 780)
  const tableHeader = () => {
    const labels = ['Point / shot', 'Design E', 'Design N', 'Design RL', 'Observed E', 'Observed N', 'Observed RL', 'dE', 'dN', 'dRL', 'H offset', 'Numerical\nresult']
    doc.rect(margin, y, width, 27).fill('#252525')
    let x = margin
    labels.forEach((label, i) => { text(label + (i > 0 && i < 11 ? '\n(m)' : ''), x + 3, y + 4, 7.5, columns[i] - 6, '#ffffff'); x += columns[i] })
    y += 27
  }
  const reportHeading = () => {
    if (!activeReport) return
    const meta = activeReport.metadata
    const lines = [
      `Design ${meta.designRevision} | CRS ${meta.crs} | Datum / benchmark: ${meta.verticalDatum || 'not provided'}`,
      `Recorded criteria: H ${meta.tolerance.horizontalM} m; V ${meta.tolerance.verticalM === undefined ? 'not assessed' : meta.tolerance.verticalM + ' m'} | ${meta.tolerance.reference}`,
    ]
    for (const line of lines) {
      doc.font('report').fontSize(7.5)
      const height = doc.heightOfString(clean(line), { width, lineGap: 2 })
      if (height > 120) throw new RangeError('The recorded reference text is too long for a readable page header.')
      text(line, margin, y, 7.5); y += height + 4
    }
    tableHeader()
  }
  const newPage = () => {
    doc.addPage(); header(); reportHeading()
    if (activePoint) { text(`Observation: ${activePoint}`, margin, y, 8); y += 20 }
  }
  const paragraph = (value: string, size = 8) => {
    let remaining = clean(value)
    while (remaining) {
      if (y + 20 > bottom) newPage()
      doc.font('report').fontSize(size)
      const available = bottom - y
      let end = remaining.length
      if (doc.heightOfString(remaining, { width, lineGap: 2 }) > available) {
        let low = 1, high = remaining.length
        while (low < high) {
          const mid = Math.ceil((low + high) / 2)
          if (doc.heightOfString(remaining.slice(0, mid), { width, lineGap: 2 }) <= available - 4) low = mid
          else high = mid - 1
        }
        end = low
        const space = remaining.lastIndexOf(' ', end)
        if (space > 0) end = space + 1
      }
      if (end <= 0) throw new RangeError('Report text cannot fit on a page.')
      const part = remaining.slice(0, end)
      const height = doc.heightOfString(part, { width, lineGap: 2 })
      text(part, margin, y, size); y += height + 5
      remaining = remaining.slice(end)
    }
  }
  const coordinate = (value: number | undefined) => value === undefined ? '-' : String(value)
  const delta = (value: number | undefined) => value === undefined ? '-' : (value >= 0 ? '+' : '') +
    (value !== 0 && Math.abs(value) < 0.0001 ? value.toExponential(4) : value.toFixed(4))
  const point = (p: StakeoutPointResult) => {
    activePoint = p.pointId
    const values = [p.pointId, coordinate(p.design.easting), coordinate(p.design.northing), coordinate(p.design.elevation),
      coordinate(p.staked.easting), coordinate(p.staked.northing), coordinate(p.staked.elevation),
      delta(p.deltaE), delta(p.deltaN), delta(p.deltaH), p.horizontalOffset !== 0 && p.horizontalOffset < 0.0001 ? p.horizontalOffset.toExponential(4) : p.horizontalOffset.toFixed(4), p.status === 'INFO' ? 'NOT ASSESSED' : p.status]
    const numericDetails: string[] = []
    const display = values.map((value, i) => {
      doc.font('report').fontSize(8.2)
      if (i > 0 && i < 11 && doc.widthOfString(value) > columns[i] - 6) {
        numericDetails.push(`${['', 'Design E', 'Design N', 'Design RL', 'Observed E', 'Observed N', 'Observed RL', 'dE', 'dN', 'dRL', 'H offset'][i]}: ${value} m`)
        return 'see detail'
      }
      return value
    })
    doc.fontSize(8.2)
    const height = Math.max(24, ...display.map((value, i) => doc.heightOfString(clean(value), { width: columns[i] - 6, lineGap: 2 }) + 8))
    const statusText = `${p.pointId} | ${p.statusReason} | Reported H accuracy: ${p.accuracyM == null ? 'not provided' : p.accuracyM + ' m'} | Device capture UTC (reported): ${p.timestamp || 'not provided'}${numericDetails.length ? ' | ' + numericDetails.join('; ') : ''}`
    doc.fontSize(8)
    const detailsHeight = doc.heightOfString(clean(statusText), { width, lineGap: 2 }) + 5 +
      (p.notes ? doc.heightOfString(clean(p.notes), { width, lineGap: 2 }) + 5 : 0)
    // Keep ordinary shots with their provenance. Oversized notes flow onto
    // numbered continuation pages with the same observation identifier.
    if (height + detailsHeight + 16 <= 250 && height + detailsHeight + 16 > bottom - y) newPage()
    if (height > bottom - y) newPage()
    if (height > bottom - y) throw new RangeError('The point identifier is too long for a readable row.')
    const fill = p.status === 'FAIL' ? '#fff0ed' : p.status === 'PASS' ? '#eff6ee' : '#fff5dd'
    doc.rect(margin, y, width, height).fill(fill)
    let x = margin
    display.forEach((value, i) => { text(value, x + 3, y + 4, 8.2, columns[i] - 6); x += columns[i] })
    y += height + 4
    paragraph(statusText)
    if (p.notes) paragraph(p.notes)
    doc.moveTo(margin, y).lineTo(margin + width, y).lineWidth(0.3).strokeColor('#c9c9c9').stroke(); y += 7
  }
  try {
    header()
    paragraph(`${options.synthetic ? 'SYNTHETIC VERIFICATION - NOT FIELD EVIDENCE. ' : ''}Device-only shots are excluded. Survey control is not verified by this report. Coordinates preserve captured decimal values; decimal places do not establish accuracy. Numerical comparisons are not construction acceptance. Professional review and design approval are required.`)
    paragraph('Legend: PASS = within entered numerical limits; WARN = review required; FAIL = entered limits exceeded; NOT ASSESSED = incomplete evidence. A dash denotes a missing measurement, never zero. Captured time, operator and instrument details are reported, not independently verified.')
    reports.forEach(report => {
      activePoint = ''
      activeReport = report
      if (doc.bufferedPageRange().count > 1 || y + 120 > bottom) newPage()
      else reportHeading()
      report.points.forEach(point)
      activePoint = ''
      paragraph(`Group summary: ${report.summary.totalPoints} shots; ${report.summary.passedPoints} numerical PASS; ${report.summary.warningPoints} WARN; ${report.summary.failedPoints} FAIL; ${report.summary.unassessedPoints} NOT ASSESSED. All verdicts require review.`)
    })
    if (legacy.length) {
      activeReport = null
      activePoint = ''
      newPage()
      paragraph('LEGACY OBSERVATIONS - NOT ASSESSED. Capture reference, precision or time was not stored. Historical status is not reconstructed as current acceptance.', 10)
      for (const row of legacy) paragraph(`Point ${row.label} | Observation ${row.id} | Historical result ${row.result}; NOT ASSESSED in this report | Stored design E/N/RL (m): ${row.design_easting} / ${row.design_northing} / ${row.design_rl ?? 'not provided'} | Stored observed E/N/RL (m): ${row.observed_easting} / ${row.observed_northing} / ${row.observed_rl ?? 'not provided'} | Server UTC ${new Date(row.staked_at).toISOString()}`)
    }
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      text(`DRAFT | Control, instrument uncertainty and design approval require verification | Page ${i + 1} of ${range.count}`, margin, doc.page.height - 55, 7)
      text('Legend: PASS=within entered limits; WARN=review; FAIL=limits exceeded; NOT ASSESSED=missing evidence. No construction acceptance.', margin, doc.page.height - 43, 7)
    }
    doc.end()
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error('PDF generation failed'))
  }
  return result
}
