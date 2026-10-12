/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import { GET as LIST_GET, POST } from '@/app/api/marketplace/listings/route'
import { GET as DETAIL_GET, PATCH } from '@/app/api/marketplace/listings/[id]/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/subscription/subscriptionEngine', () => ({ getSubscription: jest.fn() }))

const listing = {
  id: 'listing-1',
  user_id: 'seller-1',
  type: 'sale',
  category: 'total_station',
  title: 'Total station',
  brand: 'Leica',
  model: 'TS16',
  condition: 'good',
  description: 'A used instrument',
  price: '500000',
  location: 'Nairobi',
  seller_name: 'Seller',
  seller_contact: 'seller@example.com',
  images: [],
  verified: false,
  sold: false,
  updated_at: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getSubscription as jest.Mock).mockResolvedValue({ plan: 'pro' })
})

test.each(['sale', 'wanted'])('creating a %s listing cannot self-assert verification', async type => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ ...listing, type }] })

  const response = await POST({} as any, {
    userId: 'seller-1',
    body: {
      type,
      category: 'total_station',
      title: 'Total station',
      brand: 'Leica',
      model: 'TS16',
      condition: 'good',
      description: 'A used instrument',
      price: 500000,
      location: 'Nairobi',
      sellerName: 'Seller',
      sellerContact: 'seller@example.com',
      verified: true,
    },
  } as any)

  expect(response.status).toBe(201)
  expect((await response.json()).data.verified).toBe(false)
  const [sql, params] = (db.query as jest.Mock).mock.calls[0] as [string, unknown[]]
  expect(sql).toMatch(/images,\s*verified\)\s*VALUES\s*\([^)]*,FALSE\)/)
  expect(params).toHaveLength(17)
  expect(params[1]).toBe(type)
  expect(params).not.toContain(true)
})

test.each([null, { plan: 'free' }])(
  'posting requires an active paid entitlement: %j',
  async subscription => {
    ;(getSubscription as jest.Mock).mockResolvedValue(subscription)

    const response = await POST({} as any, {
      userId: 'seller-1',
      session: { user: { email: 'seller@example.com' } },
      body: { verified: true },
    } as any)

    expect(response.status).toBe(403)
    expect(getSubscription).toHaveBeenCalledWith('seller-1', 'seller@example.com')
    expect(db.query).not.toHaveBeenCalled()
  },
)
test('seller updates cannot set or clear verification', async () => {
  ;(db.query as jest.Mock)
    .mockResolvedValueOnce({ rows: [{ user_id: 'seller-1', updated_at: listing.updated_at }] })
    .mockResolvedValueOnce({ rows: [listing] })

  const response = await PATCH({} as any, {
    params: { id: listing.id },
    userId: 'seller-1',
    body: {
      title: 'Updated total station',
      updated_at: listing.updated_at,
      verified: true,
    },
  } as any)

  expect(response.status).toBe(200)
  expect((await response.json()).data.verified).toBe(false)
  const [sql, params] = (db.query as jest.Mock).mock.calls[1] as [string, unknown[]]
  expect(sql).not.toMatch(/\bverified\b/i)
  expect(params).toEqual(['Updated total station', listing.id, listing.updated_at])
})
test('public reads do not repeat legacy verification claims without evidence', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ ...listing, verified: true }] })

  const listResponse = await LIST_GET(
    new NextRequest('http://localhost/api/marketplace/listings'),
    {} as any,
  )
  const detailResponse = await DETAIL_GET({} as any, { params: { id: listing.id } } as any)

  expect((await listResponse.json()).data[0].verified).toBe(false)
  expect((await detailResponse.json()).data.verified).toBe(false)
})