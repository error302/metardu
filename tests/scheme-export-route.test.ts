/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/scheme/export/geojson/route'
import { db } from '@/lib/db'
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}))
jest.mock('@/lib/apiHandler', () => ({
  apiHandler:
    (
      _options: unknown,
      handler: (
        request: NextRequest,
        ctx: { userId: string },
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(request, { userId: '11111111-1111-4111-8111-111111111111' }),
}))
it('does not regenerate an entire project through a bare download GET', async () => {
  jest.mocked(db.query).mockResolvedValue({
    rows: [],
    rowCount: 0,
    command: 'SELECT',
    oid: 0,
    fields: [],
  })
  const result = await GET(
    new NextRequest(
      'http://127.0.0.1:3021/api/scheme/export/geojson?project_id=33333333-3333-4333-8333-333333333333',
    ),
    { params: Promise.resolve({}) },
  )
  expect(result.status).toBe(400)
  expect(db.query).not.toHaveBeenCalled()
})
