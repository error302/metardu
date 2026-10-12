/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { GET } from '@/app/api/project/[id]/points/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({
  requireProjectOwnership: jest.fn(),
  requireProjectReadAccess: jest.fn(),
}))

const mockDb = db.query as jest.Mock
const mockOwnership = requireProjectOwnership as jest.Mock
const mockReadAccess = requireProjectReadAccess as jest.Mock
const invoke = () => {
  const handler = GET as unknown as (
    request: NextRequest,
    context: { params: { id: string }; userId: string },
  ) => Promise<NextResponse>
  return handler(
    new NextRequest('http://localhost/api/project/project-1/points'),
    { params: { id: 'project-1' }, userId: 'alice' },
  )
}

beforeEach(() => {
  mockDb.mockReset()
  mockOwnership.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
  mockReadAccess.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
})

test('returns the declared project CRS from the canonical reference-system record', async () => {
  mockDb.mockResolvedValueOnce({ rows: [] })
  mockDb.mockResolvedValueOnce({ rows: [{ horizontal_crs: 'EPSG:21036' }] })

  const response = await invoke()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    meta: { project_crs: { horizontal_crs: 'EPSG:21036' } },
  })
  expect(mockDb).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM project_reference_systems'), ['project-1'])
  expect(mockDb).toHaveBeenNthCalledWith(1, expect.stringContaining('AND deleted_at IS NULL'), ['project-1'])
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('returns a missing declaration as null instead of consulting legacy CRS defaults', async () => {
  mockDb.mockResolvedValueOnce({ rows: [] })
  mockDb.mockResolvedValueOnce({ rows: [] })

  const response = await invoke()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ meta: { project_crs: null } })
  expect(mockDb).toHaveBeenNthCalledWith(
    2,
    expect.not.stringContaining('FROM projects'),
    ['project-1'],
  )
})
