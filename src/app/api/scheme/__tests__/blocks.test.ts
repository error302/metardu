/** @jest-environment node */
/**
 * Tests for /api/scheme/blocks endpoint
 * Tests validation, auth, and CRUD operations
 */

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
  jest
    .requireActual<
      typeof import('@/test-utils/rate-limit')
    >('@/test-utils/rate-limit')
    .mockRateLimitModule(),
)

jest.mock('@/lib/logger', () => ({
  auditLog: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn() },
}))

// POST route enables apiHandler auditChain, which calls appendAuditEntry
// AFTER the 2xx response. Without mocking this module, the real function
// issues 2 extra db.query calls (chain tail SELECT + INSERT), breaking the
// deterministic call-count assertions below.
jest.mock('@/lib/audit/auditLog', () => ({
  appendAuditEntry: jest.fn().mockResolvedValue({ id: 'audit-entry-1' }),
}))

import { POST, GET } from '../blocks/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { createAuthSession } from '@/test-utils/auth-session'
import { mr } from '@/test-utils/mock-rows'
import { makeRequest } from '@/test-utils/request'
import type { PoolClient } from 'pg'

const mockDb = db.query as jest.MockedFunction<typeof db.query>
const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>
const mockTransaction = db.transaction as jest.MockedFunction<
  typeof db.transaction
>

const TEST_UUID = '00000000-0000-0000-0000-000000000001'

beforeEach(() => {
  mockDb.mockReset()
  mockDb.mockResolvedValue(mr([]))
  mockTransaction.mockReset()
  mockTransaction.mockImplementation(
    <T>(work: (client: PoolClient) => Promise<T>) =>
      work({ query: mockDb } as unknown as PoolClient),
  )
})

function createMockRequest(body: unknown): NextRequest {
  return makeRequest('/api/scheme/blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

describe('POST /api/scheme/blocks', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should reject unauthenticated requests', async () => {
    mockSession.mockResolvedValue(null)
    const req = createMockRequest({ project_id: TEST_UUID, block_number: '1' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('should require project_id', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = createMockRequest({ block_number: '1' })
    const res = await POST(req)
    const data = (await res.json()) as {
      error: string
      issues: { path: (string | number)[] }[]
    }
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('project_id'))).toBe(true)
  })

  it('should require block_number', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = createMockRequest({ project_id: TEST_UUID })
    const res = await POST(req)
    const data = (await res.json()) as {
      error: string
      issues: { path: (string | number)[] }[]
    }
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/validation/i)
    const fieldPaths = data.issues.map((e) => e.path.join('.'))
    expect(fieldPaths.some((f: string) => f.includes('block_number'))).toBe(
      true,
    )
  })

  it('should create a block with valid input', async () => {
    mockSession.mockResolvedValue(createAuthSession(TEST_UUID))
    // First mock call: apiHandler's organization_members lookup (returns no orgs)
    // Then: route's project check, route's dup check, route's INSERT
    mockDb
      .mockResolvedValueOnce(mr([])) // org lookup
      .mockResolvedValueOnce(mr([{ id: TEST_UUID, project_type: 'scheme' }])) // project lock
      .mockResolvedValueOnce(mr([])) // dup check
      .mockImplementationOnce(async (_sql, values) =>
        mr([
          {
            id: values?.[0],
            block_number: '1',
            project_id: TEST_UUID,
            block_name: 'Block A',
            description: null,
            created_at: '2026-10-25T00:00:00.000Z',
            updated_at: '2026-10-25T00:00:00.000001Z',
            row_version: '100',
          },
        ]),
      )

    const req = createMockRequest({
      project_id: TEST_UUID,
      block_number: '1',
      block_name: 'Block A',
    })
    const res = await POST(req)
    const data = (await res.json()) as {
      data: { block_number: string; block_name: string }
    }

    expect(res.status).toBe(201)
    expect(data.data.block_number).toBe('1')
    expect(data.data.block_name).toBe('Block A')
    expect(mockDb).toHaveBeenCalledTimes(4)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('should reject duplicate block_number for same project', async () => {
    mockSession.mockResolvedValue(createAuthSession(TEST_UUID))
    // org lookup, then project check, then dup check (returns existing block)
    mockDb
      .mockResolvedValueOnce(mr([])) // org lookup
      .mockResolvedValueOnce(mr([{ id: TEST_UUID, project_type: 'scheme' }])) // project lock
      .mockResolvedValueOnce(mr([{ id: 'existing-block' }])) // dup check

    const req = createMockRequest({ project_id: TEST_UUID, block_number: '1' })
    const res = await POST(req)
    const data = (await res.json()) as { error: string }

    expect(res.status).toBe(409)
    expect(data.error).toMatch(/duplicate|already exists/i)
  })
})

describe('GET /api/scheme/blocks', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should reject unauthenticated requests', async () => {
    mockSession.mockResolvedValue(null)
    const req = makeRequest(`/api/scheme/blocks?project_id=${TEST_UUID}`)
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('should require project_id parameter', async () => {
    mockSession.mockResolvedValue(createAuthSession())
    const req = makeRequest('/api/scheme/blocks')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('should return blocks with parcel counts', async () => {
    mockSession.mockResolvedValue(createAuthSession(TEST_UUID))
    // Organization lookup, storage availability, then one owned directory snapshot.
    const rows = [5, 3].map((parcelCount, index) => ({
      id: `00000000-0000-0000-0000-00000000000${index + 2}`,
      project_id: TEST_UUID,
      block_number: String(index + 1),
      block_name: ['A', 'B'][index],
      description: null,
      created_at: null,
      updated_at: '2026-10-25T00:00:00.000001Z',
      row_version: '100',
      parcel_count: parcelCount,
      completed_count: index === 0 ? 3 : 0,
      assignment_count: 0,
      has_import_receipts: false,
      has_geometry: false,
      can_delete: false,
    }))
    mockDb
      .mockResolvedValueOnce(mr([]))
      .mockResolvedValueOnce(mr([{ available: true }]))
      .mockResolvedValueOnce(
        mr([
          {
            directory: {
              project: {
                id: TEST_UUID,
                name: 'Synthetic campaign',
                projectType: 'scheme',
                canCreate: true,
              },
              summary: {
                blocks: 2,
                parcels: 8,
                submittedOrApproved: 3,
                unassignedParcels: 0,
                invalidBlockLinks: 0,
                receiptRetention: 'available',
              },
              meta: { page: 1, pageSize: 24, total: 2, search: '' },
              data: rows,
            },
          },
        ]),
      )

    const req = makeRequest(`/api/scheme/blocks?project_id=${TEST_UUID}`)
    const res = await GET(req)
    const data = (await res.json()) as { data: { parcel_count: number }[] }

    expect(res.status).toBe(200)
    expect(data.data).toHaveLength(2)
    expect(data.data[0].parcel_count).toBe(5)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mockDb).toHaveBeenCalledTimes(3)
  })
})
