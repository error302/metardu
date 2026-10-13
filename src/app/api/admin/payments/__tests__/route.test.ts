/** @jest-environment node */

import { NextRequest, type NextResponse } from 'next/server'

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
const mockSetRlsRole = jest.fn<void, [unknown]>()

jest.mock('@/lib/apiHandler', () => {
  const { NextResponse } = jest.requireActual<typeof import('next/server')>('next/server')
  return {
    apiHandler: (_options: unknown, handler: unknown) => handler,
    apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  }
})
jest.mock('@/lib/db', () => ({
  db: { query: (query: string, values?: unknown[]) => mockQuery(query, values) },
  setCurrentRlsServiceRole: (role: unknown): void => { mockSetRlsRole(role) },
}))

import { GET } from '../route'

const request = () => new NextRequest('http://localhost/api/admin/payments?page=1&limit=25')

async function callGet() {
  const handler = GET as unknown as (
    request: NextRequest,
    context: { userId: string; session: null; params: Record<string, string> },
  ) => Promise<NextResponse>
  return handler(request(), { userId: '90000000-0000-4000-8000-000000000001', session: null, params: {} })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockImplementation(async (query) => {
    if (query.includes('SELECT ph.id')) {
      return {
        rows: [
          {
            id: 'payment-usd', user_id: 'user-1', user_email: 'one@example.com', user_name: 'One',
            amount: '35.00', currency: 'USD', status: 'completed', method: 'paypal', plan_id: 'pro',
            created_at: '2026-10-12T10:00:00.000Z',
          },
          {
            id: 'payment-kes', user_id: 'user-2', user_email: 'two@example.com', user_name: 'Two',
            amount: '1200.00', currency: 'KES', status: 'completed', method: 'mpesa', plan_id: 'pro',
            created_at: '2026-10-12T11:00:00.000Z',
          },
        ],
      }
    }
    if (query.includes('COUNT(*)::int AS count')) return { rows: [{ count: 2 }] }
    if (query.includes("WHERE status = 'completed'") && query.includes('created_at')) {
      return { rows: [{ currency: 'KES', total: '1200' }, { currency: 'USD', total: '35' }] }
    }
    if (query.includes("WHERE status = 'completed'")) {
      return { rows: [{ currency: 'KES', total: '1200' }, { currency: 'USD', total: '35' }] }
    }
    throw new Error(`Unexpected query: ${query}`)
  })
})

describe('GET /api/admin/payments currency reporting', () => {
  it('keeps payment rows and revenue summaries separated by their recorded currency', async () => {
    const response = await callGet()
    const body: unknown = JSON.parse(await response.text()) as unknown

    expect(response.status).toBe(200)
    expect(mockSetRlsRole).toHaveBeenCalledWith('platform_admin')
    expect(body).toMatchObject({
      payments: [
        { id: 'payment-usd', amount: 35, currency: 'USD' },
        { id: 'payment-kes', amount: 1200, currency: 'KES' },
      ],
      summary: {
        totalRevenueByCurrency: [
          { currency: 'KES', total: 1200 },
          { currency: 'USD', total: 35 },
        ],
        thisMonthByCurrency: [
          { currency: 'KES', total: 1200 },
          { currency: 'USD', total: 35 },
        ],
      },
    })

    const summaryQueries = mockQuery.mock.calls
      .map(([query]) => query)
      .filter(query => query.includes("WHERE status = 'completed'"))
    expect(summaryQueries).toHaveLength(2)
    expect(summaryQueries.every(query => query.includes('GROUP BY COALESCE(NULLIF(UPPER(currency)'))).toBe(true)
  })
})
