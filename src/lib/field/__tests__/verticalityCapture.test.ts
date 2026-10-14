import { createVerticalityCapture, parseVerticalityCapture } from '../verticalityCapture'

const fixtureCrs = 'EPSG:21037'
const criteria = { name: 'Synthetic column specification', reference: 'Synthetic drawing C1', version: 'R1', maxOffsetM: 0.025, minTiltRatio: 600, acknowledged: true, approvedBy: 'Synthetic reviewer' }
const input = { projectId: 'p', definitionId: null, label: 'C1', level: null, horizontalCrs: fixtureCrs, capturedCrs: fixtureCrs, verticalDatum: 'BM1', capturedVerticalDatum: 'BM1', capturedAt: '2026-10-14T06:00:00Z', base: { easting: 500000, northing: 9800000, rl: 100 }, top: { easting: 500000.004, northing: 9800000, rl: 103 }, horizontalUncertaintyM: 0.001, heightUncertaintyM: 0.001, criteria, instrument: 'Synthetic instrument', notes: null }

test('stores exact raw observations and explicit criteria with a versioned numerical assessment', () => {
  const snapshot = createVerticalityCapture(input)
  expect(snapshot.schemaVersion).toBe(1)
  expect(snapshot.assessment.result).toBe('PASS')
  expect(snapshot.scope).toBe('numerical_comparison_only')
  expect(parseVerticalityCapture(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
})
test.each([{ criteria: null }, { capturedAt: null }, { capturedCrs: null }, { verticalDatum: null }, { capturedVerticalDatum: null }, { top: { ...input.top, rl: null } }])('incomplete evidence remains unassessed: %j', patch => {
  expect(createVerticalityCapture({ ...input, ...patch }).assessment.result).toBe('INFO')
})
test('zero displacement serializes infinite measured ratio without turning it into unknown height', () => {
  const snapshot = createVerticalityCapture({ ...input, top: { ...input.top, easting: input.base.easting } })
  expect(snapshot.assessment.tiltRatio).toBeNull()
  expect(snapshot.assessment.tiltRatioKind).toBe('infinite')
  expect(parseVerticalityCapture(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
})
test('rejects conflicting references, reversed height and partly specified criteria', () => {
  expect(() => createVerticalityCapture({ ...input, capturedVerticalDatum: 'different' })).toThrow(/reference/i)
  expect(() => createVerticalityCapture({ ...input, top: { ...input.top, rl: 99 } })).toThrow(/top|height/i)
  expect(() => createVerticalityCapture({ ...input, criteria: { ...criteria, acknowledged: false } })).toThrow(/criteria|transcription/i)
})
test('parser ignores JSON object key order but rejects tampered numerical or reference evidence', () => {
  const snapshot = createVerticalityCapture(input)
  const reordered = { ...snapshot, criteria: Object.fromEntries(Object.entries(criteria).reverse()) }
  expect(parseVerticalityCapture(reordered)).toEqual(snapshot)
  expect(parseVerticalityCapture({ ...snapshot, assessment: { ...snapshot.assessment, offsetM: 0 } })).toBeNull()
  expect(parseVerticalityCapture({ ...snapshot, horizontalCrs: 'unknown' })).toBeNull()
})
