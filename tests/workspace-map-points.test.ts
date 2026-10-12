/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GET } from '@/app/api/project/[id]/map-points/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/rbac',()=>({canAccessProject:jest.fn().mockResolvedValue(null)}))

const mockDb = db.query as jest.Mock
const context = () => ({ userId: 'alice', params: { id: 'project-1' } })
const invoke = (query: string) => {
  const handler = GET as unknown as (request: NextRequest, ctx: ReturnType<typeof context>) => Promise<NextResponse>
  return handler(
    new NextRequest(`http://localhost/api/project/project-1/map-points${query}`),
    context(),
  )
}

beforeEach(() => {
  mockDb.mockReset()
})

test.each([
  ['another owner', 'bob', 403],
  ['unowned legacy project', null, 403],
])('rejects %s before reading survey points', async (_label, owner, status) => {
  mockDb.mockResolvedValueOnce({ rows: [{ user_id: owner }] })
  const response = await invoke('?bbox=1,2,3,4')
  expect(response.status).toBe(status)
  expect(mockDb).toHaveBeenCalledTimes(1)
})

test('returns 404 for a missing project without reading survey points', async () => {
  mockDb.mockResolvedValueOnce({ rows: [] })
  const response = await invoke('?mode=extent')
  expect(response.status).toBe(404)
  expect(mockDb).toHaveBeenCalledTimes(1)
})

test.each(['', '?bbox=1,2,1,4', '?bbox=1,2,Infinity,4', '?bbox=1,,3,4', '?bbox=1,2,3,4&mode=other'])(
  'rejects invalid viewport %s without querying survey points', async query => {
    mockDb.mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
    const response = await invoke(query)
    expect(response.status).toBe(400)
    expect(mockDb).toHaveBeenCalledTimes(1)
  },
)

test('returns no extent for an empty project', async () => {
  mockDb.mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
  mockDb.mockResolvedValueOnce({ rows: [{ min_e: null, min_n: null, max_e: null, max_n: null, total: '0' }] })
  const response = await invoke('?mode=extent')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ extent: null, total: 0, meta:{project_crs:null} })
})

test('returns coordinate extent without sending all project points', async () => {
  mockDb.mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
  mockDb.mockResolvedValueOnce({ rows: [{ min_e: 100, min_n: 200, max_e: 300, max_n: 400, total: '65000' }] })
  const response = await invoke('?mode=extent')
  expect(await response.json()).toEqual({ extent: [100, 200, 300, 400], total: 65000, meta:{project_crs:null} })
  expect(mockDb).toHaveBeenNthCalledWith(2, expect.stringContaining('MIN(easting)'), ['project-1'])
})

test('bounds viewport results at 500 and marks a partial view', async () => {
  mockDb.mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
  mockDb.mockResolvedValueOnce({ rows: Array.from({ length: 501 }, (_, index) => ({
    id: `point-${index}`, point_name: `P${index}`, easting: index, northing: index + 1,
  })) })
  const response = await invoke('?bbox=0,0,600,700')
  const payload = await response.json() as {
    points: Array<{ id: string; name: string | null; easting: number; northing: number }>
    truncated: boolean
    limit: number
  }
  expect(response.status).toBe(200)
  expect(payload.points).toHaveLength(500)
  expect(payload.truncated).toBe(true)
  expect(payload.limit).toBe(500)
  expect(mockDb).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT 501'), ['project-1', 0, 0, 600, 700])
})

test('marks a complete viewport when fewer than 501 rows are present', async () => {
  mockDb.mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
  mockDb.mockResolvedValueOnce({ rows: [{
    id: 'point-1', point_name: 'A', easting: 10, northing: 20,
  }] })
  const response = await invoke('?bbox=0,0,50,50')
  expect(await response.json()).toMatchObject({
    points: [{ id: 'point-1', name: 'A', easting: 10, northing: 20 }],
    truncated: false,
  })
})

test.each(['?mode=extent','?bbox=0,0,50,50','?bbox=0,0,50,50&clustered=true&cellSize=5'])
('excludes soft-deleted field points from map query %s',async query=>{
  mockDb.mockResolvedValueOnce({rows:[{user_id:'alice'}]})
  mockDb.mockResolvedValueOnce({rows:[]})
  expect((await invoke(query)).status).toBe(200)
  const call=mockDb.mock.calls[1] as [string,unknown[]]
  const sql=call[0]
  expect(sql).toMatch(/WHERE project_id = \$1\s+AND deleted_at IS NULL/)
})
