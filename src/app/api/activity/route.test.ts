/** @jest-environment node */
import { NextRequest } from 'next/server'
import { activityFeedQuery } from '@/lib/activityFeed'
const mockQuery = jest.fn<Promise<{ rows: Array<{ id: string }> }>, [string, unknown[]]>()
jest.mock('@/lib/db', () => ({ db: { query: (sql: string, params: unknown[]) => mockQuery(sql, params) } }))
jest.mock('@/lib/auth/session', () => ({ getAuthUser: jest.fn() }))
jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
  apiSuccess: (value: unknown) => Response.json(value),
}))
import { GET } from './route'
const userId = '00000000-0000-4000-8000-000000000001'
const projectId = '00000000-0000-4000-8000-000000000002'
const read = (search = '') => (GET as unknown as (req: NextRequest, ctx: { userId: string }) => Promise<Response>)(
  new NextRequest('http://localhost/api/activity' + search), { userId },
)
beforeEach(() => mockQuery.mockReset())
it.each(['?limit=-1', '?limit=0', '?limit=51', '?limit=NaN', '?limit=2x', '?offset=1.5', '?offset=100001', '?project_id=invalid'])('rejects invalid filters before querying: %s', async search => {
  expect((await read(search)).status).toBe(400)
  expect(mockQuery).not.toHaveBeenCalled()
})
it('uses the authenticated identity and returns a bounded page with hasMore', async () => {
  mockQuery.mockResolvedValue({ rows: [{ id: 'first' }, { id: 'second' }, { id: 'third' }] })
  const result = await read('?limit=2&offset=1&project_id=' + projectId)
  expect(mockQuery).toHaveBeenCalledWith(activityFeedQuery, [userId, 3, 1, projectId])
  expect(await result.json()).toEqual({ activities: [{ id: 'first' }, { id: 'second' }], pagination: { limit: 2, offset: 1, total: 2, hasMore: true } })
})
it('does not misrepresent a failed data read as an empty feed', async () => {
  mockQuery.mockRejectedValue(new Error('database unavailable'))
  await expect(read()).rejects.toThrow('database unavailable')
})
