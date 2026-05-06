/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { POST, GET } from '../parcels/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

function createAuthSession() {
  return { user: { id: 'user-1', email: 'test@metardu.com', name: 'Test' }, expires: new Date().toISOString() }
}

describe('POST /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should require block_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new Request('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel_number: '1' }),
    })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldNames = data.details.map((e: any) => e.path.join('.'))
    expect(fieldNames.some((f: string) => f.includes('block_id'))).toBe(true)
  })

  it('should require parcel_number', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new Request('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: 1 }),
    })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldNames = data.details.map((e: any) => e.path.join('.'))
    expect(fieldNames.some((f: string) => f.includes('parcel_number'))).toBe(true)
  })

  it('should create parcel with valid input', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    // Mock 4 sequential DB queries: project check, block check, duplicate check, insert
    mockDb
      .mockResolvedValueOnce({ rows: [{ id: 1, project_type: 'scheme' }] })  // project check
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // block belongs to project
      .mockResolvedValueOnce({ rows: [] })  // no duplicate
      .mockResolvedValueOnce({ rows: [{ id: 'p-1', parcel_number: '101', block_id: 1, status: 'pending', area_ha: 0.5 }] })  // insert

    const req = new Request('http://localhost/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 1, block_id: 1, parcel_number: '101', area_ha: 0.5 }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
    expect(mockDb).toHaveBeenCalledTimes(4)
  })
})

describe('GET /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should return parcels for a block', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    mockDb.mockResolvedValue({
      rows: [
        { id: 'p-1', parcel_number: '101', status: 'computed', area_ha: 0.5 },
        { id: 'p-2', parcel_number: '102', status: 'pending', area_ha: 0.3 },
      ],
    })

    const req = new Request('http://localhost/api/scheme/parcels?block_id=b-1')
    const res = await GET(req as any)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.data).toHaveLength(2)
  })

  it('should require block_id or project_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new Request('http://localhost/api/scheme/parcels')
    const res = await GET(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
  })
})
