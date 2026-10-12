/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { GET } from '@/app/api/project/[id]/map-points/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectReadAccess: jest.fn() }))

const mockDb = db.query as jest.Mock
const mockReadAccess = requireProjectReadAccess as jest.Mock

function invoke(query = '') {
  const handler = GET as unknown as (
    request: NextRequest,
    context: { params: { id: string }; userId: string },
  ) => Promise<NextResponse>
  return handler(
    new NextRequest(`http://localhost/api/project/project-1/map-points${query}`),
    { params: { id: 'project-1' }, userId: 'alice' },
  )
}

beforeEach(() => {
  mockDb.mockReset()
  mockReadAccess.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
})

test('extent response includes only the declared project CRS', async () => {
  mockDb.mockResolvedValueOnce({
    rows: [{
      min_e: '100', min_n: '200', max_e: '300', max_n: '400',
      total: '12', horizontal_crs: 'EPSG:3857',
    }],
  })

  const response = await invoke('?mode=extent')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    extent: [100, 200, 300, 400],
    total: 12,
    meta: { project_crs: { horizontal_crs: 'EPSG:3857' } },
  })
  expect(mockDb).toHaveBeenCalledTimes(1)
  expect(mockDb).toHaveBeenCalledWith(expect.stringContaining('FROM project_reference_systems'), ['project-1'])
})

test('bbox response is bounded and includes map styling attributes', async () => {
  mockDb.mockResolvedValueOnce({
    rows: [{
      id: 'point-1', point_name: 'BM01', easting: '500000', northing: '9800000',
      elevation: '1723.45', code: 'CONTROL', description: 'Primary control', is_control: true,
    }],
  })

  const response = await invoke('?bbox=499000,9799000,501000,9801000')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    points: [{
      id: 'point-1', name: 'BM01', easting: 500000, northing: 9800000,
      elevation: 1723.45, code: 'CONTROL', description: 'Primary control', is_control: true,
    }],
    truncated: false,
    limit: 500,
  })
  expect(mockDb).toHaveBeenCalledWith(expect.stringContaining('LIMIT 501'), [
    'project-1', 499000, 9799000, 501000, 9801000,
  ])
})

test('cluster mode preserves exact controls and returns count-bearing topo summaries', async () => {
  mockDb.mockResolvedValueOnce({
    rows: [{
      id: null,
      point_name: '4 topo points',
      easting: '500010',
      northing: '9800000',
      elevation: null,
      code: null,
      description: null,
      is_control: false,
      feature_kind: 'cluster',
      cluster_count: '4',
      cell_min_e: '500000',
      cell_min_n: '9799990',
      cell_max_e: '500020',
      cell_max_n: '9800010',
    }],
  })

  const response = await invoke('?bbox=499000,9799000,501000,9801000&clustered=true&cellSize=20')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    points: [{
      id: null,
      name: '4 topo points',
      easting: 500010,
      northing: 9800000,
      elevation: null,
      code: null,
      description: null,
      is_control: false,
      feature_kind: 'cluster',
      cluster_count: 4,
      cell_extent: [500000, 9799990, 500020, 9800010],
    }],
    truncated: false,
    truncationReason: null,
    limit: 500,
    clustered: true,
  })
  expect(mockDb).toHaveBeenCalledWith(expect.stringContaining('GROUP BY FLOOR(easting / $6)'), [
    'project-1', 499000, 9799000, 501000, 9801000, 20,
  ])
  expect(mockDb).toHaveBeenCalledWith(expect.stringContaining("WHERE is_control"), expect.any(Array))
})

test('identifies a clipped control network so the map warns that the view is partial', async () => {
  mockDb.mockResolvedValueOnce({
    rows: Array.from({ length: 501 }, (_, index) => ({
      id: `control-${index}`,
      point_name: `C${index}`,
      easting: 500000 + index,
      northing: 9800000 + index,
      elevation: null,
      code: 'CONTROL',
      description: null,
      is_control: true,
      feature_kind: 'point',
      cluster_count: 1,
      cell_min_e: null,
      cell_min_n: null,
      cell_max_e: null,
      cell_max_n: null,
    })),
  })

  const response = await invoke('?bbox=499000,9799000,501000,9801000&clustered=true&cellSize=20')

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    truncated: true,
    truncationReason: 'control-points',
    clustered: true,
  })
  expect(mockDb).toHaveBeenCalledWith(expect.stringContaining('ORDER BY is_control DESC'), expect.any(Array))
})

test('cluster mode rejects a cell smaller than the viewport safety bound', async () => {
  const response = await invoke('?bbox=499000,9799000,501000,9801000&clustered=true&cellSize=0.01')

  expect(response.status).toBe(400)
  expect(mockDb).not.toHaveBeenCalled()
})

test('rejects invalid bounding boxes without querying survey data', async () => {
  const response = await invoke('?bbox=1,2,1,4')

  expect(response.status).toBe(400)
  expect(mockDb).not.toHaveBeenCalled()
})

test('does not query survey data when project read access is denied', async () => {
  mockReadAccess.mockResolvedValueOnce({
    ok: false,
    error: Response.json({ error: 'Forbidden' }, { status: 403 }),
  })

  const response = await invoke('?mode=extent')

  expect(response.status).toBe(403)
  expect(mockDb).not.toHaveBeenCalled()
})
