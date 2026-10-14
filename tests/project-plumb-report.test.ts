/** @jest-environment node */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import Papa from 'papaparse'
import { createVerticalityCapture } from '@/lib/field/verticalityCapture'
import { preparePlumbHistory, generatePlumbHistoryCsv, generatePlumbHistoryHtml, type SavedPlumbRow } from '@/lib/reports/projectPlumbHistory'
import { generatePlumbHistoryPdf } from '@/lib/reports/projectPlumbPdf'
const fixtureCrs = 'EPSG:21037'
const snapshot = createVerticalityCapture({ projectId: 'synthetic-project', definitionId: null, label: 'C1', level: 'L1', horizontalCrs: fixtureCrs, capturedCrs: fixtureCrs, verticalDatum: 'BM1', capturedVerticalDatum: 'BM1', capturedAt: '2026-10-14T06:00:00Z', base: { easting: 500000.0001234567, northing: 9800000, rl: 100 }, top: { easting: 500000.0041234567, northing: 9800000, rl: 103 }, horizontalUncertaintyM: 0.001, heightUncertaintyM: 0.001, criteria: { name: 'Synthetic criteria', reference: 'Synthetic drawing C1', version: 'R1', maxOffsetM: 0.025, minTiltRatio: 600, acknowledged: true, approvedBy: 'Synthetic reviewer' }, instrument: 'Synthetic instrument', notes: 'Synthetic verification only - no field acceptance.' })
const row: SavedPlumbRow = { id: 'synthetic-reading', project_id: snapshot.projectId, project_name: 'Synthetic project', definition_id: null, label: 'C1', level: 'L1', base_easting: '500000.000', base_northing: '9800000.000', base_rl: '100.000', top_easting: '500000.004', top_northing: '9800000.000', top_rl: '103.000', offset_h: '0.0040', tilt_ratio: '1:750', tolerance_ratio: '1:600', result: 'PASS', instrument: snapshot.instrument, observed_by: 'synthetic-user', observed_at: '2026-10-14T06:00:05Z', notes: snapshot.notes, capture_snapshot: snapshot, client_reading_id: 'synthetic-device-id' }
const historic: SavedPlumbRow = { ...row, id: 'historical-reading', capture_snapshot: null, client_reading_id: null, result: 'WARN' }
test('uses exact capture values and keeps historic results separate from current assessment', () => {
  const model = preparePlumbHistory([row, historic])
  expect(model.items[0].base.easting).toBe(500000.0001234567)
  expect(model.items[0].exportAssessment).toBe('PASS')
  expect(model.items[1].recordedResult).toBe('WARN')
  expect(model.items[1].exportAssessment).toBe('NOT ASSESSED')
  expect(model.items[1].crs).toBeNull()
  expect(model.items[1].units).toBe('Not recorded')
  const data = Papa.parse<Record<string, string>>(generatePlumbHistoryCsv([row, historic]), { header: true }).data
  expect(data[0].Base_E_m).toBe('500000.0001234567')
  expect(data[1].Recorded_result).toBe('WARN')
  expect(data[1].Export_assessment).toBe('NOT ASSESSED')
})
test('rejects mismatched snapshot identity, rounded-register coherence and mixed-project batches', () => {
  for (const patch of [{ label: 'wrong' }, { base_easting: '600000.000' }, { result: 'FAIL' }]) expect(() => preparePlumbHistory([{ ...row, ...patch }])).toThrow(/evidence|inconsistent/i)
  expect(() => preparePlumbHistory([row, { ...historic, project_id: 'other' }])).toThrow(/project/i)
})
test('escapes HTML content and never adds a current CRS or statutory certification to old readings', () => {
  const html = generatePlumbHistoryHtml([{ ...historic, notes: '<script>alert(1)</script>' }], { synthetic: true })
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('NOT ASSESSED')
  expect(html).toContain('SYNTHETIC')
  expect(html).not.toContain(fixtureCrs)
  expect(html).not.toContain('Easting (m)')
})
test('generates and parses the real native PDF with the verified font and canonical logo', async () => {
  const options = { synthetic: true, font: readFileSync('public/fonts/JetBrainsMono-Regular.ttf'), logo: readFileSync('public/metardu-icon.png') }
  const pdf = await generatePlumbHistoryPdf([row, historic], options)
  const document = await PDFDocument.load(pdf)
  expect(document.getPageCount()).toBeGreaterThan(0)
  expect(document.getPageCount()).toBeLessThanOrEqual(3)
  mkdirSync('.cache/release-verify', { recursive: true })
  writeFileSync('.cache/release-verify/plumb-saved-history.pdf', pdf)
  writeFileSync('.cache/release-verify/plumb-saved-history.html', generatePlumbHistoryHtml([row, historic], { synthetic: true, logoDataUrl: 'data:image/png;base64,' + options.logo.toString('base64') }))
  writeFileSync('.cache/release-verify/plumb-saved-history.csv', generatePlumbHistoryCsv([row, historic]))
})
test('native PDF retains long metadata across repeated pages and rejects unsupported glyphs', async () => {
  const options = { font: readFileSync('public/fonts/JetBrainsMono-Regular.ttf'), logo: readFileSync('public/metardu-icon.png') }
  const note = 'Synthetic long observation note. '.repeat(100).trim()
  const capture = createVerticalityCapture({ ...snapshot, notes: note })
  const data = { ...row, capture_snapshot: capture, notes: note }
  const pdf = await generatePlumbHistoryPdf([data, { ...data, id: 'second-reading' }], options)
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(2)
  await expect(generatePlumbHistoryPdf([{ ...historic, notes: '測' }], options)).rejects.toThrow(/font|character/i)
  await expect(generatePlumbHistoryPdf([row], { ...options, font: Buffer.from('wrong font') })).rejects.toThrow(/font/i)
})
