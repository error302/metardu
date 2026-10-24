import { readDrawingCsv, readProjectDrawingSource, drawingReferenceIssue, MAX_DRAWING_POINTS } from '@/lib/topo/drawingSource'

const CRS = 'EPSG:32632'
const OTHER_CRS = 'EPSG:21037'
const reference = { prs: { horizontalCrs: CRS, datum: 'WGS 84', zone: 32, hemisphere: 'N', units: 'metres', distanceMode: 'grid', verticalDatum: 'Synthetic BM', coordinatePrecision: 3 } }
const context = { data: { referenceSystem: reference, referenceHash: 'a'.repeat(64) } }
const point = { id: 'retained-a', point_name: 'A', easting: 500000, northing: 6000000, elevation: 0, code: 'SPOT', description: 'Source description', horizontal_crs: 'EPSG:32632', vertical_datum: 'Synthetic BM' }
const source = (rows: unknown[]) => ({ data: rows, meta: { project_id: 'project-a' } })
test('retains source identity, unknown code, zero and negative heights without forcing a Kenyan CRS', () => {
  const result = readProjectDrawingSource('project-a', source([point, { ...point, id: 'retained-b', point_name: 'B', elevation: -2 }]), context)
  expect(result.points.map(p => [p.id, p.pointNumber, p.elevation, p.code])).toEqual([['retained-a', 'A', 0, 'SPOT'], ['retained-b', 'B', -2, 'SPOT']])
  expect(result.reference.code).toBe(CRS)
})
test.each([
  ['numeric string', { easting: '500000' }], ['missing horizontal coordinate', { northing: null }],
  ['nonfinite height', { elevation: Infinity }], ['unknown CRS', { horizontal_crs: null }],
  ['different CRS', { horizontal_crs: OTHER_CRS }], ['different height reference', { vertical_datum: 'Other BM' }],
  ['unknown height reference', { vertical_datum: null }], ['outside grid range', { easting: -9999 }],
])('rejects the entire project source for %s', (_name, change) => {
  expect(() => readProjectDrawingSource('project-a', source([point, { ...point, id: 'retained-b', point_name: 'B', ...change }]), context)).toThrow()
})
test('retains unknown height as unknown for visible source review', () => {
  const result = readProjectDrawingSource('project-a', source([{ ...point, elevation: null, vertical_datum: null }]), context)
  expect(result.points[0].elevation).toBeUndefined()
})
test('rejects duplicate identities and excess rows rather than merging or truncating', () => {
  expect(() => readProjectDrawingSource('project-a', source([point, point]), context)).toThrow(/duplicate/i)
  expect(() => readProjectDrawingSource('project-a', source(Array(MAX_DRAWING_POINTS + 1).fill(point)), context)).toThrow(/No rows were omitted/)
})
test.each([null, { prs: { ...reference.prs, units: 'feet' } }, { prs: { ...reference.prs, horizontalCrs: 'EPSG:3857' } }, { prs: { ...reference.prs, horizontalCrs: 'EPSG:4326' } }])('never infers a reference from a missing or invalid declaration', value => {
  expect(() => readProjectDrawingSource('project-a', source([point]), { data: { ...context.data, referenceSystem: value } })).toThrow(/Declare/)
})
test('shared coordinate CSV parser uses explicit headers and preserves missing/zero/negative heights', () => {
  const points = readDrawingCsv('code,id,northing,elevation,easting\nSH,P1,6000000,0,500000\nSH,P2,6000020,-2,500020\nSH,P3,6000010,,500010')
  expect(points.map(p => [p.pointNumber, p.easting, p.northing, p.elevation])).toEqual([['P1', 500000, 6000000, 0], ['P2', 500020, 6000020, -2], ['P3', 500010, 6000010, undefined]])
})
test.each([
  'id,easting,northing,elevation\nP1,500000junk,6000000,0',
  'id,easting,northing,elevation\nP1,500000,6000000,Infinity',
  'id,easting,northing,elevation\nP1,500000,,0',
  'id,easting,northing,elevation\nP1,500000,6000000,0\nP1,500010,6000010,1',
  'id,easting,e,northing\nP1,500000,500001,6000000',
  'P1,500000,6000000,0',
])('rejects a bad CSV atomically', text => expect(() => readDrawingCsv(text)).toThrow())
test('requires a projected survey reference and a declared basis for heights', () => {
  const points = readDrawingCsv('id,easting,northing,elevation\nP1,500000,6000000,0')
  expect(drawingReferenceIssue(points, CRS, 'Synthetic BM')).toBeNull()
  expect(drawingReferenceIssue(points, 'EPSG:3857', 'Synthetic BM')).toBeTruthy()
  expect(drawingReferenceIssue(points, 'EPSG:4326', 'Synthetic BM')).toBeTruthy()
  expect(drawingReferenceIssue(points, CRS, '')).toMatch(/height reference/)
})
