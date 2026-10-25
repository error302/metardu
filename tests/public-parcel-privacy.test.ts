/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/public/parcel/[id]/route'
import db from '@/lib/db'
jest.mock('@/lib/db', () => {
  const database = { query: jest.fn() }
  return { __esModule: true, default: database, db: database }
})
jest.mock('@/lib/security/rateLimit', () => ({
  rateLimit: async () => ({ allowed: true, remaining: 99 }),
  getOperationRateLimitIdentifier: () => 'synthetic-public-privacy',
}))
const project = '33333333-3333-4333-8333-333333333333'
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(db.query).mockResolvedValue({
    rows: [
      {
        id: project,
        name: 'Private job',
        client_name: 'Private client',
        area_ha: 1,
        user_id: null,
        boundary_data: {
          adjustedStations: [
            { station: 'A', easting: 500000, northing: 9500000 },
            { station: 'B', easting: 500010, northing: 9500000 },
            { station: 'C', easting: 500010, northing: 9500010 },
          ],
        },
      },
    ],
    rowCount: 1,
    command: 'SELECT',
    oid: 0,
    fields: [],
  })
})
it('does not disclose a private project through its UUID without a sharing capability', async () => {
  const response = await GET(
    new NextRequest(`http://127.0.0.1:3021/api/public/parcel/${project}`),
    { params: Promise.resolve({ id: project }) },
  )
  expect(response.status).toBe(404)
  expect(await response.text()).not.toMatch(
    /Private client|500000|FOUND|Arc 1960|Concrete/,
  )
  expect(db.query).not.toHaveBeenCalled()
})
it.each(['?token=secret', '?project_id=elsewhere', '?key=secret'])(
  'does not accept credentials or resource substitutions in the public query %s',
  async (query) => {
    const response = await GET(
      new NextRequest(
        `http://127.0.0.1:3021/api/public/parcel/${project}${query}`,
      ),
      { params: Promise.resolve({ id: project }) },
    )
    expect(response.status).toBe(404)
    expect(db.query).not.toHaveBeenCalled()
  },
)
