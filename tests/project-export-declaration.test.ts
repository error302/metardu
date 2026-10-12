/** @jest-environment node */
import { NextRequest } from 'next/server'
import { buildProjectReferenceSystem, toReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
const mockRegister = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined)
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler, apiSuccess: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { query: (...args: [string, unknown[]?]) => mockQuery(...args) } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn().mockResolvedValue({ ok: true }) }))
jest.mock('@/lib/deliverables/deliverableRegister', () => ({ registerDeliverable: (input: unknown) => mockRegister(input) }))
import { GET } from '@/app/api/project/[id]/export/route'

const projectId = '10000000-0000-4000-8000-000000000010'
const prs = buildProjectReferenceSystem({ datum: 'WGS84', utmZone: 36, hemisphere: 'N', distanceMode: 'grid', coordinatePrecision: 3 })
const declared = toReferenceSystemRow(projectId, { prs }, 'owner')
let reference: Record<string, unknown> | undefined
let stations: unknown[] | undefined
let rawCrs: string | null
let isControl: boolean
const request = () => new NextRequest(`http://localhost/api/project/${projectId}/export?format=csv`)
const context = { params: { id: projectId }, userId: 'owner' }

beforeEach(() => {
  jest.clearAllMocks()
  reference = declared
  stations = undefined
  rawCrs = prs.horizontalCrs
  isControl = false
  mockQuery.mockImplementation(async sql => {
    if (sql.includes('FROM project_reference_systems')) return { rows: reference ? [reference] : [] }
    if (sql.includes('FROM survey_points')) return { rows: [{ point_name: 'SYN-ZERO', easting: '500000', northing: '0', elevation: null, horizontal_crs: rawCrs, is_control: isControl }] }
    if (sql.includes('SELECT updated_at')) return { rows: [{ updated_at: '2026-10-10', revision: null }] }
    if (sql.includes('FROM projects')) return { rows: [{ id: projectId, name: 'SYNTHETIC EXPORT', utm_zone: 37, hemisphere: 'S', datum: 'ARC1960', boundary_data: stations ? { adjustedStations: stations } : null }] }
    throw new Error('Unexpected query')
  })
})

test('legacy display fields do not authorize export without a saved declaration', async () => {
  reference = undefined
  const response = await GET(request(), context)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'CRS_UNDECLARED' })
  expect(mockRegister).not.toHaveBeenCalled()
})

test('saved declaration governs the register and preserves zero northing privately', async () => {
  const response = await GET(request(), context)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.text()).toContain('"SYN-ZERO",500000.0000,0.0000,,survey')
  expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({ projectCrs: prs.horizontalCrs }))
  expect(mockQuery.mock.calls.find(([sql]) => sql.includes('FROM survey_points'))?.[0]).toMatch(/deleted_at IS NULL/)
})

test.each([
  { pointName: 'SYN-INCOMPLETE', adjustedEasting: 500000, northing: 0 },
  { pointName: 'SYN-NONFINITE', adjustedEasting: 500000, adjustedNorthing: Infinity },
  { pointName: 'SYN-COERCED', adjustedEasting: true, adjustedNorthing: [] },
])('refuses unusable adjusted coordinates without inventing replacements: $pointName', async station => {
  stations = [station]
  expect((await GET(request(), context)).status).toBe(400)
  expect(mockRegister).not.toHaveBeenCalled()
})

test('a corrupt declaration cannot fall back to legacy display fields', async () => {
  reference = { ...declared, distance_mode: 'corrupt' }
  expect((await GET(request(), context)).status).toBe(400)
  expect(mockRegister).not.toHaveBeenCalled()
})

test('raw points require source CRS evidence matching the saved declaration', async () => {
  rawCrs = null
  expect((await GET(request(), context)).status).toBe(400)
  expect(mockRegister).not.toHaveBeenCalled()
})

test('a complete adjustment takes both axes from that result and retains its precision', async () => {
  stations = [{ pointName: 'SYN-ADJUSTED', adjustedEasting: 500000.1234, adjustedNorthing: 0, easting: 499999, northing: 100 }]
  const response = await GET(request(), context)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('"SYN-ADJUSTED",500000.1234,0.0000,,survey')
})

test('coordinate schedule preserves the canonical saved control flag', async () => {
  isControl = true
  const response = await GET(request(), context)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('"SYN-ZERO",500000.0000,0.0000,,control')
})
