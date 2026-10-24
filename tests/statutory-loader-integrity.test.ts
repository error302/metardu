/** @jest-environment node */
import { db } from '@/lib/db'
import { loadGateInputForProject, mergeGateInput } from '@/lib/validation/statutoryGateLoader'
import { runStatutoryGate } from '@/lib/validation/statutoryGate'
import { defined } from '@/test-utils/defined'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
const query = jest.mocked(db.query)
beforeEach(() => jest.clearAllMocks())
function loadedGate(input: NonNullable<Awaited<ReturnType<typeof loadGateInputForProject>>>) {
  return runStatutoryGate(mergeGateInput(input, { surveyor: { name: 'Synthetic', licenseNumber: 'ISK/LS/2020/123' } }))
}

test('a failed evidence query cannot become a credential-only passing result', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects')) return { rows: [{ survey_type: 'cadastral' }] } as never
    throw new Error('private SQL failure')
  })
  const input = await loadGateInputForProject('project')
  expect(input).not.toBeNull()
  const gate = loadedGate(defined(input))
  expect(gate.passed).toBe(false)
  expect(JSON.stringify(gate)).not.toContain('private SQL failure')
})

test('missing parcel ordinates are retained as invalid evidence instead of zero', async () => {
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects') ? [{ survey_type: 'cadastral' }]
    : sql.includes('FROM parcels WHERE') ? [{ parcel_number: 'P', boundary_geometry: { type: 'Polygon', coordinates: [[[null, 0], [10, 0], [0, 10], [null, 0]]] } }] : [] }) as never)
  const input = await loadGateInputForProject('project')
  expect(input?.parcels?.[0].vertices[0].easting).not.toBe(0)
  expect(loadedGate(defined(input)).passed).toBe(false)
})

test('the largest resulting parcel is not invented as a parent reference', async () => {
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects') ? [{ survey_type: 'cadastral' }]
    : sql.includes('FROM parcels WHERE') ? [10, 20].map(size => ({ parcel_number: String(size), boundary_geometry: { type: 'Polygon', coordinates: [[[0, 0], [size, 0], [0, size], [0, 0]]] } })) : [] }) as never)
  expect((await loadGateInputForProject('project'))?.parentParcel).toBeUndefined()
})

test('current field-observation evidence does not run the incompatible legacy traverse query', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects')) return { rows: [{ survey_type: 'cadastral', boundary_data: {
      computation: { source: 'field-observations' }, linear_misclosure: 0.001, perimeter_m: 400, precision_ratio: '1:400000',
      adjustedStations: [{ pointName: 'A', adjustedEasting: 0, adjustedNorthing: 0 }, { pointName: 'B', adjustedEasting: 100, adjustedNorthing: 0 }, { pointName: 'C', adjustedEasting: 100, adjustedNorthing: 100 }, { pointName: 'D', adjustedEasting: 0, adjustedNorthing: 100 }],
    } }] } as never
    if (sql.includes('parcel_traverses')) throw new Error('Legacy result columns do not exist')
    return { rows: [] } as never
  })
  const input = await loadGateInputForProject('project')
  expect(loadedGate(defined(input)).passed).toBe(true)
  expect(input?.parcels?.[0].vertices[0]).toMatchObject({ easting: 0, northing: 0 })
  expect(query.mock.calls.some(([sql]) => sql.includes('parcel_traverses'))).toBe(false)
})

test('field book entries alone retain unknown closure instead of a zero-error traverse', async () => {
  query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM projects') ? [{ survey_type: 'cadastral' }]
    : sql.includes('project_fieldbook_entries') ? [{ station: 'A' }, { station: 'B' }, { station: 'C' }] : [] }) as never)
  const input = await loadGateInputForProject('project')
  expect(input?.traverse?.linearErrorM).toBeNaN()
  expect(loadedGate(defined(input)).passed).toBe(false)
})
