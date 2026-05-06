/** @jest-environment node */
/**
 * Tests for /api/scheme/blocks endpoint
 * Tests validation, auth, and CRUD operations
 */

// Mock dependencies
jest.mock('@/lib/db', () => ({
  db: {
    query: jest.fn(),
  },
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { POST, GET } from '../blocks/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

function createMockRequest(body: any): Request {
  return new Request('http://localhost/api/scheme/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createAuthSession(userId: string = 'user-1') {
  return {
    user: { id: userId, email: 'test@metardu.com', name: 'Test User' },
    expires: new Date().toISOString(),
  }
}

describe('POST /api/scheme/blocks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should reject unauthenticated requests', async () => {
    mockSession.mockResolvedValue(null)
    const req = createMockRequest({ project_id: 'proj-1', block_number: '1' })
    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })

  it('should require project_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = createMockRequest({ block_number: '1' })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    // Zod validation returns 'Validation failed' with field details
    expect(data.error).toMatch(/validation/i)
    const fieldNames = data.details.map((e: any) => e.path.join('.'))
    expect(fieldNames.some((f: string) => f.includes('project_id'))).toBe(true)
  })

  it('should require block_number', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = createMockRequest({ project_id: 1 })
    const res = await POST(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
    // Zod validation returns 'Validation failed' with field details
    expect(data.error).toMatch(/validation/i)
    const fieldNames = data.details.map((e: any) => e.path.join('.'))
    expect(fieldNames.some((f: string) => f.includes('block_number'))).toBe(true)
  })

  it('should create a block with valid input', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    // Mock the 3 sequential DB queries: project check, duplicate check, insert
    mockDb
      .mockResolvedValueOnce({ rows: [{ id: 1, project_type: 'scheme' }] })  // project check
      .mockResolvedValueOnce({ rows: [] })  // no duplicate
      .mockResolvedValueOnce({ rows: [{ id: 'block-1', block_number: '1', project_id: 1, block_name: 'Block A' }] })  // insert

    const req = createMockRequest({
      project_id: 1,
      block_number: '1',
      block_name: 'Block A',
    })
    const res = await POST(req as any)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.data.block_number).toBe('1')
    expect(data.data.block_name).toBe('Block A')
    expect(mockDb).toHaveBeenCalledTimes(3)
  })

  it('should reject duplicate block_number for same project', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    // Mock: project check passes, duplicate check finds existing block
    mockDb
      .mockResolvedValueOnce({ rows: [{ id: 1, project_type: 'scheme' }] })  // project check
      .mockResolvedValueOnce({ rows: [{ id: 'existing-block' }] })  // duplicate found

    const req = createMockRequest({
      project_id: 1,
      block_number: '1', // Already exists
    })
    const res = await POST(req as any)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.error).toMatch(/duplicate|already exists/i)
  })
})

describe('GET /api/scheme/blocks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should reject unauthenticated requests', async () => {
    mockSession.mockResolvedValue(null)
    const req = new Request('http://localhost/api/scheme/blocks?project_id=proj-1')
    const res = await GET(req as any)
    expect(res.status).toBe(401)
  })

  it('should require project_id parameter', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = new Request('http://localhost/api/scheme/blocks')
    const res = await GET(req as any)
    const data = await res.json()
    expect(res.status).toBe(400)
  })

  it('should return blocks with parcel counts', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    mockDb.mockResolvedValue({
      rows: [
        { id: 'b1', block_number: '1', block_name: 'A', parcel_count: 5, completed_count: 3 },
        { id: 'b2', block_number: '2', block_name: 'B', parcel_count: 3, completed_count: 0 },
      ],
    })

    const req = new Request('http://localhost/api/scheme/blocks?project_id=proj-1')
    const res = await GET(req as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.data).toHaveLength(2)
    expect(data.data[0].parcel_count).toBe(5)
  })
})
