import type { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { GET } from '../route'
import { expect } from '@jest/globals'
import { mr } from '@/test-utils/mock-rows'



jest.mock('next/server', () => {
  class MockNextResponse {
    status: number
    headers: Map<string, string>
    private readonly content: string

    constructor(content: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
      this.content = content
    }

    static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
      const headers = Object.fromEntries(new Headers(init?.headers).entries())
      return new MockNextResponse(JSON.stringify(body), { status: init?.status, headers })
    }

    async json(): Promise<unknown> {
      return JSON.parse(this.content)
    }
  }

  return { NextResponse: MockNextResponse }
})

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))

jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
}))

const getLookup = GET as unknown as (request: NextRequest, context: never) => Promise<NextResponse>
const query = db.query as jest.MockedFunction<typeof db.query>
const mockFetch = jest.fn()
const originalFetch = global.fetch

function request(url: string) {
  return { url } as NextRequest
}

function context(userId = 'user-session') {
  return { userId } as never
}

describe('GET /api/nlims/lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: mockFetch })
    query.mockResolvedValue(mr([]))
  })

  afterEach(() => {
    if (originalFetch) Object.defineProperty(global, 'fetch', { configurable: true, writable: true, value: originalFetch })
    else Reflect.deleteProperty(global, 'fetch')
  })

  it('never calls the undocumented government URL and distinguishes a local miss from an official not-found result', async () => {
    const response = await getLookup(request('https://metardu.test/api/nlims/lookup?parcel=NRM%2F123&county=Nairobi'), context())

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(await response.json()).toMatchObject({
      found: false,
      code: 'OFFICIAL_REGISTRY_ACCESS_UNAVAILABLE',
      error: expect.stringMatching(/does not mean the parcel is absent/i),
    })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[0][1]).toEqual(['NRM/123', 'user-session'])
  })

  it('returns private, non-cacheable personal-vault records scoped to the authenticated user', async () => {
    query.mockResolvedValueOnce(mr([{
      parcel_number: 'NRM/123',
      user_id: 'user-session',
      parsed_data: { parcelNumber: 'NRM/123', county: 'Nairobi' },
      freshness: 'checked by user',
      certificate_date: null,
    }]))
    const response = await getLookup(request('https://metardu.test/api/nlims/lookup?parcel=nrm%2F123'), context())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    expect(await response.json()).toMatchObject({ found: true, source: 'VAULT_PERSONAL', parcel: { parcelNumber: 'NRM/123' } })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][1]).toEqual(['NRM/123', 'user-session'])
  })

  it('rejects oversized parcel input before querying any data', async () => {
    const response = await getLookup(request(`https://metardu.test/api/nlims/lookup?parcel=${'A'.repeat(101)}`), context())
    expect(response.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
})
