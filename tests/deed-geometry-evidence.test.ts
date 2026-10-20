/** @jest-environment node */
import { computeDeedPlanGeometry, loadPreAdjustedFromDB } from '@/lib/generators/deedPlanGeometry'
import db from '@/lib/db'
import { fieldBookRevision } from '@/lib/survey/fieldBookRevision'
jest.mock('@/lib/db', () => ({ __esModule: true, default: { query: jest.fn() } }))
const coords = [
  { station: 'A', easting: 500000, northing: 9900000 },
  { station: 'B', easting: 500100, northing: 9900000 },
  { station: 'C', easting: 500100, northing: 9900100 },
]
beforeEach(() => {
  jest.resetAllMocks()
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [] })
})
test('pre-adjusted coordinates without closure evidence remain unverified', async () => {
  const result = await computeDeedPlanGeometry('p', { preAdjustedCoordinates: coords })
  expect(result.closureStatus).toBe('UNVERIFIED')
  expect(result.precisionRatio).toBe('Unverified')
})
test('an explicitly measured zero-error traverse may pass', async () => {
  const result = await computeDeedPlanGeometry('p', { preAdjustedCoordinates: coords,
    preAdjustedClosure: { misclosureMm: 0, precisionRatio: Infinity } })
  expect(result.closureStatus).toBe('PASS')
})
test('field-book stations retain their starting coordinates, not the next station coordinates', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes('parcel_traverses')) return { rows: [] }
    if (sql.includes('project_fieldbook_entries')) return { rows: [
      { station: 'A', raw_data: { bearing: 0, distance: 100 } },
      { station: 'B', raw_data: { bearing: 90, distance: 100 } },
      { station: 'C', raw_data: { bearing: 180, distance: 100 } },
      { station: 'D', raw_data: { bearing: 270, distance: 100 } },
    ] }
    return { rows: [{ boundary_data: { startE: 500000, startN: 9900000 }, utm_zone: 37, hemisphere: 'S' }] }
  })
  const result = await computeDeedPlanGeometry('p')
  expect(result.stations[0]).toMatchObject({ station: 'A', easting: 500000, northing: 9900000 })
  expect(result.stations[1]).toMatchObject({ station: 'B', easting: 500000, northing: 9900100 })
})

test.each([NaN, Infinity])('rejects nonfinite pre-adjusted coordinates (%s)', async value => {
  await expect(computeDeedPlanGeometry('p', { preAdjustedCoordinates: [
    { ...coords[0], easting: value }, coords[1], coords[2],
  ] })).rejects.toThrow(/finite|coordinate/i)
})

test('does not label coordinates with an assumed projection or scale factors', async () => {
  const result = await computeDeedPlanGeometry('p', { preAdjustedCoordinates: coords })
  expect(result.projection).toBeUndefined()
  expect(result.lineScaleFactors).toBeUndefined()
})

test.each([
  { utm_zone: 36, hemisphere: 'S', datum: 'WGS84', expected: 'UTM36S' },
  { utm_zone: 37, hemisphere: 'S', datum: 'WGS84', expected: 'UTM37S' },
  { utm_zone: 37, hemisphere: 'N', datum: 'WGS84', expected: undefined },
  { utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', expected: undefined },
  { utm_zone: 38, hemisphere: 'S', datum: 'WGS84', expected: undefined },
])('scale factors require supported project metadata: $utm_zone/$hemisphere/$datum', async metadata => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [metadata] })
  const result = await computeDeedPlanGeometry('p', { preAdjustedCoordinates: coords })
  expect(result.projection).toBe(metadata.expected)
  if (metadata.expected) {
    expect(result.lineScaleFactors).toHaveLength(3)
    expect(result.lineScaleFactors?.[0].scaleFactor).toBeCloseTo(0.9996, 6)
    expect(result.lineScaleFactors?.[0].gridDistance).toBeCloseTo(100, 6)
  } else expect(result.lineScaleFactors).toBeUndefined()
})

function savedBoundary(links = [
  { station_from: 'A1', station_to: 'A2' },
  { station_from: 'A2', station_to: 'A10' },
  { station_from: 'A10', station_to: 'A1' },
], invalidEasting?: unknown, metadataFailure = false) {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes('parcel_traverses')) {
      if (/linear_misclosure|precision_ratio/.test(sql)) throw new Error('column does not exist')
      return { rows: [{ id: 'traverse' }] }
    }
    if (sql.includes('traverse_coordinates')) {
      if (!sql.includes('station_name AS station') || !sql.includes('elevation AS rl')) throw new Error('column does not exist')
      return { rows: [
        { station: 'A1', easting: invalidEasting === undefined ? '500000' : invalidEasting, northing: '9900000', rl: '0' },
        { station: 'A10', easting: '500100', northing: '9900100', rl: null },
        { station: 'A2', easting: '500000', northing: '9900100', rl: '12.345' },
      ] }
    }
    if (sql.includes('traverse_observations')) return { rows: links }
    if (sql.includes('project_fieldbook_entries') && metadataFailure) throw new Error('metadata query failed')
    return { rows: [] }
  })
}

test('saved coordinates use canonical columns and observation order, preserving elevations', async () => {
  savedBoundary()
  const saved = await loadPreAdjustedFromDB('p')
  expect(saved?.stations.map(station => station.station)).toEqual(['A1', 'A2', 'A10'])
  expect(saved?.stations.map(station => station.elevation)).toEqual([0, 12.345, undefined])
  expect(saved?.closure).toBeUndefined()
  const result = await computeDeedPlanGeometry('p')
  expect(result.bearingSchedule.map(leg => [leg.from, leg.to])).toEqual([
    ['A1', 'A2'], ['A2', 'A10'], ['A10', 'A1'],
  ])
  expect(result.areaM2).toBe(5000)
})

test('does not infer a closed boundary from incomplete saved observations', async () => {
  savedBoundary([{ station_from: 'A1', station_to: 'A2' }])
  await expect(loadPreAdjustedFromDB('p')).rejects.toThrow(/ordered boundary/i)
})

test.each([null, '', '12abc', 'Infinity'])('rejects invalid stored coordinate %j', async value => {
  savedBoundary(undefined, value)
  await expect(loadPreAdjustedFromDB('p')).rejects.toThrow(/finite coordinates/i)
})

test('does not disguise missing beacon evidence after a database failure', async () => {
  savedBoundary(undefined, undefined, true)
  await expect(loadPreAdjustedFromDB('p')).rejects.toThrow('metadata query failed')
})

test('propagates database failures instead of substituting other coordinate evidence', async () => {
  ;(db.query as jest.Mock).mockRejectedValue(new Error('database unavailable'))
  await expect(computeDeedPlanGeometry('p')).rejects.toThrow('database unavailable')
})

function gridDraft(change: 'none' | 'reference' | 'rows' | 'coordinates' = 'none') {
  const crs = 'EPSG:' + (32700 + 36)
  const startControl = { name: 'A', easting: 500000, northing: 9900000, crs, notes: 'Imagery simulation' }
  const rows = coords.map((point, index) => ({ id: `row-${index}`, station: point.station, row_index: index, raw_data: { remark: 'Unverified' } }))
  const boundary_data = {
    startControl, adjustedStations: coords.map(point => ({ pointName: point.station, adjustedEasting: point.easting, adjustedNorthing: point.northing })),
    precision_ratio: '1:∞', linear_misclosure: 0,
    computation: { source: 'recorded-grid-traverse', crs, source_revision: fieldBookRevision(rows, startControl), acceptance_status: 'draft_unverified', field_verified: false },
  }
  if (change === 'coordinates') boundary_data.adjustedStations[0].adjustedEasting = NaN
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes('FROM project_reference_systems')) return { rows: [{ horizontal_crs: change === 'reference' ? 'EPSG:' + (32700 + 37) : crs, datum_name: 'WGS 84', distance_mode: 'grid', coordinate_precision: 3 }] }
    if (sql.includes('FROM project_fieldbook_entries')) return { rows: change === 'rows' ? rows.slice(1) : rows }
    if (sql.includes('FROM projects')) return { rows: [{ boundary_data, utm_zone: 37, hemisphere: 'S', datum: 'WGS84' }] }
    throw new Error('Unexpected fallback: ' + sql)
  })
}

test('an imagery/grid computation retains coordinates and declared CRS without becoming measured closure', async () => {
  gridDraft()
  const result = await computeDeedPlanGeometry('p')
  expect(result.stations.map(({ station, easting, northing }) => ({ station, easting, northing }))).toEqual(coords)
  expect(result.stations.every(point => point.monument === '' && point.beaconNo === '')).toBe(true)
  expect(result.closureStatus).toBe('UNVERIFIED')
  expect(result.precisionRatio).toBe('Unverified')
  expect(result.projection).toBe('UTM36S')
})

test.each(['reference', 'rows', 'coordinates'] as const)('rejects a grid draft after invalid %s without substituting another boundary', async change => {
  gridDraft(change)
  await expect(computeDeedPlanGeometry('p')).rejects.toThrow(/recompute/i)
})

function fieldBook(raw: Record<string, unknown>, boundary_data: unknown = { startE: 0, startN: 0 }) {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes('parcel_traverses')) return { rows: [] }
    if (sql.includes('project_fieldbook_entries')) return { rows: [
      { station: 'A', raw_data: raw },
      { station: 'B', raw_data: { bearing: 120, distance: 100 } },
      { station: 'C', raw_data: { bearing: 240, distance: 100 } },
    ] }
    return { rows: [{ boundary_data }] }
  })
}

test.each([{}, { bearing: '' }, { bearing: 'nonsense' }, { bs: '90' },
  { bearing: '10°90\'00"' }, { bearing: '450' }])('rejects missing or invalid field bearing %j', async raw => {
  fieldBook({ distance: 100, ...raw })
  await expect(computeDeedPlanGeometry('p')).rejects.toThrow(/bearing/i)
})

test.each([null, {}, { startE: NaN, startN: 0 }, { startE: 0, startN: Infinity }])('requires finite start coordinates %j', async seed => {
  fieldBook({ bearing: 0, distance: 100 }, seed)
  await expect(computeDeedPlanGeometry('p')).rejects.toThrow(/starting/i)
})
