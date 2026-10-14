import Papa from 'papaparse'
import { analyzePipelineAsBuilt } from '../pipelineAsBuilt'
import { parsePipelineAsBuiltCsv, pipelineAsBuiltTemplate, pipelineAsBuiltReportCsv, pipelineAsBuiltReportHtml } from '../pipelineAsBuiltCsv'
const csv = 'point_id,chainage_m,invert_rl_m,ground_rl_m,internal_diameter_mm,outside_diameter_mm,joint_type,remarks\n"CP, west",-10,0,-0.15,300,400,socket,"measured, exposed"\nP2,0,-0.5,,,,,'
test('actual CSV import retains quoted identifiers, zero/signed levels and optional unknowns', () => {
  const points = parsePipelineAsBuiltCsv(csv)
  expect(points[0]).toMatchObject({ id: 'CP, west', chainage: -10, invertElevation: 0, groundElevation: -0.15, pipeDiameter: 300, outsideDiameter: 400, remarks: 'measured, exposed' })
  expect(points[1]).toMatchObject({ groundElevation: null, outsideDiameter: null })
})
test.each([
  'point_id,chainage_m,invert_rl_m\nP,0,bad', 'point_id,chainage_m,invert_rl_m\n,0,0',
  'point_id,chainage_m,invert_rl_m\nP,0,0\nP,1,0',
  'point_id,chainage_m,invert_rl_m,easting\nP,0,0,1',
  'point_id,chainage_m,invert_rl_m\nP,0,0,extra',
  'point_id,chainage_m,invert_rl_m,ground_rl_m\nP,0,0,Infinity',
])('malformed or unsupported input cannot silently produce a partial survey: %s', input => {
  expect(() => parsePipelineAsBuiltCsv(input)).toThrow()
})
test('the downloadable template defines the same explicit import contract', () => {
  expect(pipelineAsBuiltTemplate()).toContain('outside_diameter_mm')
  expect(() => parsePipelineAsBuiltCsv(pipelineAsBuiltTemplate())).toThrow('no observations')
})
test('report CSV preserves all raw and calculated fields, blank unknowns and inert spreadsheet text', () => {
  const result = analyzePipelineAsBuilt(parsePipelineAsBuiltCsv(csv.replace('CP, west', '=HYPERLINK(1)')))
  const records = Papa.parse<Record<string, string>>(pipelineAsBuiltReportCsv(result, { route: 'R1', designReference: 'D1', verticalReference: 'BM1', observer: 'Test surveyor', instrument: 'Test level' }), { header: true, skipEmptyLines: true }).data
  expect(records).toHaveLength(2)
  expect(records[0].point_id).toBe("'=HYPERLINK(1)")
  expect(Number(records[0].cover_m)).toBeCloseTo(-0.5, 10)
  expect(records[1].cover_m).toBe('')
  expect(records[1].next_segment_grade_percent).toBe('')
  expect(records[0].cover_assessment).toBe('NOT ASSESSED')
  expect(records[0].vertical_reference).toBe('BM1')
})
test('printable output escapes text, includes every observation and exposes missing references', () => {
  const points = parsePipelineAsBuiltCsv(csv); points[0].remarks = '<script>alert(1)</script>'
  const html = pipelineAsBuiltReportHtml(analyzePipelineAsBuilt(points), { route: 'R1', designReference: '', verticalReference: '', observer: '', instrument: '' })
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('CP, west'); expect(html).toContain('P2')
  expect(html).toContain('Not recorded'); expect(html).toContain('DRAFT')
  expect(html).not.toContain('Kenya Water Pipeline Standards')
})

test('the full report CSV reopens original measured observations without trusting derived values', () => {
  const original = parsePipelineAsBuiltCsv(csv)
  const exported = pipelineAsBuiltReportCsv(analyzePipelineAsBuilt(original), { route: 'R1', designReference: 'D1', verticalReference: 'BM1', observer: 'S1', instrument: 'L1' })
  const reopened = parsePipelineAsBuiltCsv(exported)
  expect(reopened).toEqual(original)
})
test('report text escaping is reversible for formula-like IDs and preserves genuine leading apostrophes', () => {
  const original = parsePipelineAsBuiltCsv(csv)
  original[0].id = '=HYPERLINK(1)'; original[0].remarks = '-observed'
  original[1].id = "'=original identifier"
  const report = pipelineAsBuiltReportCsv(analyzePipelineAsBuilt(original), { route: '', designReference: '', verticalReference: '', observer: '', instrument: '' })
  const parsed = Papa.parse<string[]>(report, { skipEmptyLines: true }).data
  parsed[1][parsed[0].indexOf('cover_m')] = '999'
  expect(parsePipelineAsBuiltCsv(Papa.unparse(parsed))).toEqual(original)
})
