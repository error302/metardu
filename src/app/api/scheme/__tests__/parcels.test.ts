/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
  setCurrentUserId: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/security/rateLimit', () => ({
  rateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  getClientIdentifier: jest.fn().mockReturnValue('test-client'),
}))

jest.mock('@/lib/logger', () => ({
  auditLog: jest.fn(),
}))

import { POST, GET } from '../parcels/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const TEST_PROJECT_UUID = '00000000-0000-0000-0000-000000000001'
const TEST_BLOCK_UUID = '00000000-0000-0000-0000-000000000002'

/** Wrap mock rows into a pg QueryResult-like shape */
// eslint-disable-next-line
function mr(rows: any[]) {
  return { rows, command: '' as const, rowCount: rows.length, oid: 0 as const, fields: [] as any }
}

function createAuthSession() {
  return { user: { id: 'user-1', email: 'test@metardu.com', name: 'Test' }, expires: new Date().toISOString() }
}

describe('POST /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should require block_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new NextRequest('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel_number: '1' }),
    })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e: any) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('block_id'))).toBe(true)
  })

  it('should require parcel_number', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new NextRequest('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: TEST_BLOCK_UUID }),
    })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e: any) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('parcel_number'))).toBe(true)
  })

  it('should create parcel with valid input', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    mockDb
      .mockResolvedValueOnce(mr([{ id: 1, project_id: TEST_PROJECT_UUID }]))
      .mockResolvedValueOnce(mr([]))
      .mockResolvedValueOnce(mr([{ id: 'p-1', parcel_number: '101', block_id: TEST_BLOCK_UUID, status: 'pending', area_ha: 0.5 }]))

    const req = new NextRequest('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: TEST_BLOCK_UUID, parcel_number: '101', area_ha: 0.5 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
    expect(mockDb).toHaveBeenCalledTimes(3)
  })
})

describe('GET /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should return parcels for a block', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    mockDb
      .mockResolvedValueOnce(mr([{ id: 1 }]))
      .mockResolvedValueOnce(mr([
        { id: 'p-1', parcel_number: '101', status: 'computed', area_ha: 0.5 },
        { id: 'p-2', parcel_number: '102', status: 'pending', area_ha: 0.3 },
      ]))

    const req = new NextRequest(`http://localhost/api/scheme/parcels?block_id=${TEST_BLOCK_UUID}`)
    const res = await GET(req as any)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.data).toHaveLength(2)
  })

  it('should require block_id or project_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new NextRequest('http://localhost/api/scheme/parcels')
    const res = await GET(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
  })
})
