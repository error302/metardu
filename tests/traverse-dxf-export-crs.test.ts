/** @jest-environment node */
import { invokeMockApi } from '@/test-utils/invokeMockApi'
import { db } from '@/lib/db'
import { POST } from '@/app/api/compute/export/traverse-dxf/route'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))

const context = { userId: 'owner', body: { projectId: 'project-1' } }

/** A project row with the requested CRS declaration. */
function projectRow(crs: { datum: string | null; utm_zone: number | null; hemisphere: string | null }) {
  return {
    id: 'project-1',
    name: 'Boundary Survey',
    location: 'Nairobi',
    project_type: 'cadastral',
    surveyor_name: 'A. Surveyor',
    scheme_number: 'LR 123',
    county: 'Nairobi',
    ...crs,
  }
}

const traverseRow = {
  traverse_id: 'traverse-1',
  parcel_id: 'parcel-1',
  is_closed: true,
  linear_error: 0.01,
  precision_ratio: 10000,
  total_perimeter: 120,
  accuracy_order: '1:10000',
  parcel_number: '1',
  lr_number_proposed: 'LR 123/1',
  block_number: 'A',
}

const coordRows = [
  { station: 'A1', easting: 500000, northing: 1000000, rl: null },
  { station: 'A2', easting: 500100, northing: 1000000, rl: null },
]

const observationRows = [
  {
    station: 'A1',
    bs: 'A2',
    fs: 'A1',
    hcl_deg: '0', hcl_min: '0', hcl_sec: '0',
    hcr_deg: '90', hcr_min: '0', hcr_sec: '0',
    slope_dist: '100',
  },
]

/** Capture every SQL string the route issues so we can assert on the columns. */
let issuedSql: string[] = []

function mockDb(project: ReturnType<typeof projectRow>) {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    issuedSql.push(sql)
    if (sql.includes('FROM projects p')) return { rows: [project] }
    if (sql.includes('FROM parcel_traverses')) return { rows: [traverseRow] }
    if (sql.includes('FROM traverse_coordinates')) return { rows: coordRows }
    if (sql.includes('FROM traverse_observations')) return { rows: observationRows }
    throw new Error(`Unexpected query: ${sql}`)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  issuedSql = []
})

test('the project CRS is read from the projects table, not from a scheme_details column that does not exist', async () => {
  mockDb(projectRow({ datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S' }))
  const response = await invokeMockApi(POST, context)
  expect(response.status).toBe(200)

  const projectQuery = issuedSql.find((sql) => sql.includes('FROM projects p'))
  expect(projectQuery).toBeDefined()
  expect(projectQuery).toContain('p.datum')
  expect(projectQuery).not.toContain('sd.datum')
})

test('the DXF title block prints the declared reference system', async () => {
  mockDb(projectRow({ datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S' }))
  const response = await invokeMockApi(POST, context)
  expect(response.status).toBe(200)
  const dxf = await response.text()
  expect(dxf).toContain('Arc 1960 / UTM Zone 37S (EPSG:21037)')
})

test('an undeclared project prints NOT DECLARED instead of a remembered Kenyan datum', async () => {
  mockDb(projectRow({ datum: null, utm_zone: null, hemisphere: null }))
  const response = await invokeMockApi(POST, context)
  expect(response.status).toBe(200)
  const dxf = await response.text()
  expect(dxf).toContain('NOT DECLARED')
  expect(dxf).not.toContain('Arc 1960')
  expect(dxf).not.toContain('UTM Zone 37S')
})

test('a half-declared project is still NOT DECLARED — no half-built reference system', async () => {
  mockDb(projectRow({ datum: 'Arc 1960', utm_zone: 37, hemisphere: null }))
  const response = await invokeMockApi(POST, context)
  expect(response.status).toBe(200)
  const dxf = await response.text()
  expect(dxf).toContain('NOT DECLARED')
  expect(dxf).not.toContain('Arc 1960')
})
