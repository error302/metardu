/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
  setCurrentUserId: jest.fn(),
  setCurrentOrgId: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/security/rateLimit', () =>
  jest.requireActual<typeof import('@/test-utils/rate-limit')>('@/test-utils/rate-limit').mockRateLimitModule())

jest.mock('@/lib/logger', () => ({
  auditLog: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn() },
}))

import { POST, GET } from '../parcels/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { createAuthSession } from '@/test-utils/auth-session'
import { mr } from '@/test-utils/mock-rows'
import { makeRequest } from '@/test-utils/request'
import type { PoolClient } from 'pg'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockTransaction = db.transaction as jest.MockedFunction<typeof db.transaction>

const TEST_PROJECT_UUID = '00000000-0000-0000-0000-000000000001'
const TEST_BLOCK_UUID = '00000000-0000-0000-0000-000000000002'

beforeEach(() => {
  mockDb.mockReset()
  mockDb.mockResolvedValue(mr([]))
  mockTransaction.mockImplementation(<T>(work:(client:PoolClient)=>Promise<T>)=>work({query:mockDb} as unknown as PoolClient))
})



/** Schema-valid parcel row — parcelSchema in src/lib/validation/scheme.ts. */
function validParcel(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000003',
    project_id: TEST_PROJECT_UUID,
    block_id: TEST_BLOCK_UUID,
    parcel_number: '101',
    lr_number_proposed: null,
    lr_number_confirmed: null,
    area_ha: 0.5,
    status: 'pending',
    assigned_surveyor: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}



describe('POST /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should require block_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = makeRequest('/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcel_number: '1' }),
    })
    const res = await POST(req)
    const data = (await res.json()) as { error: string; issues: { path: (string | number)[] }[] }
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('block_id'))).toBe(true)
  })

  it('should require parcel_number', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = makeRequest('/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_id: TEST_BLOCK_UUID }),
    })
    const res = await POST(req)
    const data = (await res.json()) as { error: string; issues: { path: (string | number)[] }[] }
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('parcel_number'))).toBe(true)
  })

  it('should create parcel with valid input', async () => {
    mockSession.mockResolvedValue(createAuthSession('00000000-0000-4000-8000-000000000004'))
    // Context lookup, then the parent/block locks, duplicate read and exact INSERT acknowledgement.
    mockDb
      .mockResolvedValueOnce(mr([]))                                                                                          // org lookup
      .mockResolvedValueOnce(mr([{ id: TEST_PROJECT_UUID }]))                                                               // parent owner lock
      .mockResolvedValueOnce(mr([{ id: TEST_BLOCK_UUID }]))                                                                 // block lock
      .mockResolvedValueOnce(mr([]))                                                                                          // dup check
      .mockImplementationOnce(async (_sql,params)=>mr([validParcel({id:params?.[0],revision_number:1,updated_at:'2026-01-01T00:00:00.123456Z'})]))

    const req = makeRequest('/api/scheme/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id:TEST_PROJECT_UUID,block_id: TEST_BLOCK_UUID, parcel_number: '101', area_ha: 0.5 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockDb).toHaveBeenCalledTimes(5)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/scheme/parcels', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should return parcels for a block', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    // First mock: apiHandler's org lookup. Then: route's block check, route's SELECT parcels.
    mockDb
      .mockResolvedValueOnce(mr([]))                                                                                            // org lookup
      .mockResolvedValueOnce(mr([{ id: 1 }]))                                                                                    // block check
      .mockResolvedValueOnce(mr([
        validParcel({ id: '00000000-0000-0000-0000-000000000004', parcel_number: '101', status: 'computed', block_number: 'B1', block_name: 'Block 1' }),
        validParcel({ id: '00000000-0000-0000-0000-000000000005', parcel_number: '102', status: 'pending', block_number: 'B1', block_name: 'Block 1' }),
      ]))

    const req = makeRequest(`/api/scheme/parcels?block_id=${TEST_BLOCK_UUID}`)
    const res = await GET(req)
    const data = (await res.json()) as { data: unknown[] }
    expect(res.status).toBe(200)
    expect(data.data).toHaveLength(2)
  })

  it('should require block_id or project_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = makeRequest('/api/scheme/parcels')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
