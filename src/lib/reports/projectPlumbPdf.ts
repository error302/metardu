import { createSurveyDocument } from '@/lib/documents/pdf-engine'
import { createHash } from 'node:crypto'
import fontCoverage from '../../../public/fonts/JetBrainsMono-coverage.json'
import { preparePlumbHistory, type PlumbReportOptions, type SavedPlumbRow } from './projectPlumbHistory'
import { UnsupportedSetoutPdfTextError } from './projectSetoutPdf'

export const MAX_PLUMB_PDF_ROWS = 250
const supported = new Set(fontCoverage.codePoints)
/** Native vector history report, using server evidence and the existing verified assets. */
export async function generatePlumbHistoryPdf(rows: SavedPlumbRow[], options: PlumbReportOptions & { logo: Buffer; font: Buffer }): Promise<Buffer> {
  if (rows.length > MAX_PLUMB_PDF_ROWS) throw new RangeError('PDF supports at most 250 saved plumb readings; filter the column or recording dates.')
  if (createHash('sha256').update(options.font).digest('hex') !== fontCoverage.fontSha256) throw new Error('Report font does not match verified glyph coverage.')
  const model = preparePlumbHistory(rows), generated = new Date().toISOString()
  const doc = createSurveyDocument({ paperSize: 'A4', orientation: 'landscape', scale: 1, bufferPages: true,
    metadata: { title: 'DRAFT - saved column-plumb history', projectReference: model.first.project_id, date: generated.slice(0, 10), surveyorName: 'Not supplied', surveyorLicense: 'Not supplied' } })
  doc.registerFont('report', options.font).font('report')
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => { doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const margin = 34, width = doc.page.width - margin * 2, bottom = doc.page.height - 75
  let y = margin, activeObservation = ''
  const clean = (value: unknown) => String(value ?? 'Not recorded').replace(/[\u2010-\u2015\u2212]/g, '-').replaceAll('·', ' | ')
  const checkText = (value: string) => { for (const character of value) { const code = character.codePointAt(0); if (code != null && ![9, 10, 13].includes(code) && !supported.has(code)) throw new UnsupportedSetoutPdfTextError() } }
  const text = (value: unknown, x: number, top: number, size = 8, cellWidth = width, color = '#181818') => {
    const content = clean(value); checkText(content)
    doc.font('report').fontSize(size).fillColor(color).text(content, x, top, { width: cellWidth, lineGap: 2 })
  }
  const header = () => {
    doc.image('data:image/png;base64,' + options.logo.toString('base64'), margin, margin, { width: 30, height: 30 })
    text('DRAFT - SAVED COLUMN-PLUMB HISTORY', margin + 43, margin, 14, width - 43)
    text(`Project ${model.first.project_id} | Generated UTC ${generated}`, margin, margin + 42, 7.2)
    text(options.synthetic ? 'SYNTHETIC VERIFICATION ONLY - NOT FIELD EVIDENCE' : 'Saved server observations - numerical comparison only', margin, margin + 57, 7.2)
    doc.moveTo(margin, margin + 74).lineTo(margin + width, margin + 74).strokeColor('#92713b').lineWidth(1).stroke()
    y = margin + 82
  }
  const newPage = () => { doc.addPage(); header(); if (activeObservation) { text(`Continued observation ${activeObservation}`, margin, y, 8); y += 20 } }
  const paragraph = (value: unknown, size = 8) => {
    let remaining = clean(value); checkText(remaining)
    while (remaining.length) {
      if (y + 22 > bottom) newPage()
      doc.font('report').fontSize(size)
      let end = remaining.length
      if (doc.heightOfString(remaining, { width, lineGap: 2 }) > bottom - y) {
        let low = 1, high = remaining.length
        while (low < high) { const middle = Math.ceil((low + high) / 2); if (doc.heightOfString(remaining.slice(0, middle), { width, lineGap: 2 }) <= bottom - y - 3) low = middle; else high = middle - 1 }
        end = low
        if (end <= 1) { newPage(); continue }
      }
      const part = remaining.slice(0, end)
      text(part, margin, y, size)
      y += doc.heightOfString(part, { width, lineGap: 2 }) + 5
      remaining = remaining.slice(end)
      if (remaining) newPage()
    }
  }
  const centreTable = (base: { easting: number | null; northing: number | null; rl: number | null }, top: { easting: number | null; northing: number | null; rl: number | null }, verifiedUnits: boolean) => {
    const columns = [0.12, 0.31, 0.31, 0.26].map(value => value * width)
    const suffix = verifiedUnits ? ' (m)' : ''
    const lines = [['Centre', 'Easting' + suffix, 'Northing' + suffix, 'RL' + suffix], ['Base', base.easting, base.northing, base.rl], ['Top', top.easting, top.northing, top.rl]]
    lines.forEach((line, index) => {
      let x = margin
      const height = 23
      if (index === 0) doc.rect(x, y, width, height).fill('#252525')
      line.forEach((cell, col) => { text(cell, x + 6, y + 6, 8, columns[col] - 12, index === 0 ? '#ffffff' : '#181818'); x += columns[col] })
      doc.rect(margin, y, width, height).strokeColor('#bbbbbb').lineWidth(0.4).stroke()
      y += height
    })
    y += 8
  }
  try {
    header()
    paragraph(model.first.project_name, 11)
    paragraph(`${model.summary.total} saved readings | Numerical PASS ${model.summary.passed} | FAIL ${model.summary.failed} | NOT ASSESSED ${model.summary.unassessed}`)
    paragraph('No survey control, calibration, source approval or construction acceptance is certified. Historical results are preserved; current references/limits are not assigned to old records. Coordinates retain source precision.')
    for (const item of model.items) {
      const r = item.row, s = item.snapshot, c = s?.criteria
      activeObservation = ''
      if (y + 160 > bottom) newPage()
      activeObservation = r.id
      paragraph(`${r.label} | Level ${r.level ?? 'Not recorded'} | ${item.exportAssessment}`, 10)
      paragraph(`Observation ${r.id} | Recorded result ${item.recordedResult} | ${s ? 'Versioned numerical capture' : 'Historical record - NOT ASSESSED'}`)
      centreTable(item.base, item.top, Boolean(s))
      if (!s) paragraph('Capture coordinate/level units were not recorded. Values above are shown as stored; no current metre CRS is assigned.')
      paragraph(`${s ? 'Captured numerical' : 'Historical recorded'} offset ${item.offset ?? 'Not recorded'}${s ? ' m' : ''} | Height ${item.height ?? 'Not recorded'}${s ? ' m' : ''} | Ratio ${item.ratio}`)
      paragraph(item.explanation)
      paragraph(`Capture/observed CRS: ${item.crs ?? 'Not recorded'} / ${s?.capturedCrs ?? 'Not recorded'} | Declared/observed height reference: ${item.verticalDatum ?? 'Not recorded'} / ${s?.capturedVerticalDatum ?? 'Not recorded'}`)
      paragraph(`Reported displacement/height uncertainty (m): ${s?.horizontalUncertaintyM ?? 'Not recorded'} / ${s?.heightUncertaintyM ?? 'Not recorded'} | Criteria ${c?.name ?? 'Not recorded'} | Maximum offset ${c?.maxOffsetM ?? 'Not recorded'} m | Minimum ratio ${c?.minTiltRatio ?? 'Not recorded'}`)
      paragraph(`Source/revision: ${c?.reference ?? 'Not recorded'} / ${c?.version ?? 'Not recorded'} | Named approver (transcription): ${c?.approvedBy ?? 'Not recorded'}`)
      paragraph(`Device capture UTC: ${s?.capturedAt ?? 'Not recorded'} (reported) | Server recorded UTC: ${item.recordedAt} | Account: ${r.observed_by ?? 'Not recorded'}`)
      paragraph(`Instrument: ${r.instrument ?? 'Not recorded'} | Device reading: ${r.client_reading_id ?? 'Not recorded'} | Algorithm: ${s?.algorithm.id ?? 'Not recorded'} / ${s?.algorithm.version ?? 'Not recorded'}`)
      if (r.notes) paragraph(`Notes: ${r.notes}`)
      y += 10
    }
    activeObservation = ''
    const range = doc.bufferedPageRange()
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page)
      text(`DRAFT | Source, uncertainty and construction acceptance require review | Page ${page + 1} of ${range.count}`, margin, doc.page.height - 59, 7)
      text('Legend: PASS=entered limits; FAIL=limits exceeded; NOT ASSESSED=missing evidence. Device-only drafts excluded.', margin, doc.page.height - 46, 7)
    }
    doc.end()
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error('Plumb PDF generation failed')) }
  return result
}
