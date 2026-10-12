/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, unknown[]>()
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) } }))
jest.mock('@/lib/api/handler', () => ({
  apiHandler: (options: { handler: (ctx: unknown) => Promise<NextResponse> }) =>
    async (req: NextRequest) => options.handler({
      req, userId: 'test-user', input: req.method === 'POST' ? await req.json() as unknown : undefined,
    }),
}))
import { GET, POST } from '@/app/api/fieldbook/audit/route'

const projectId = '10000000-0000-4000-8000-000000000001'
const request = (query: string) => new NextRequest(`http://localhost/api/fieldbook/audit?${query}`)
beforeEach(() => { jest.clearAllMocks(); mockQuery.mockResolvedValue({ rows: [] }) })

test('project history filters by retained project scope, including deleted rows and other team actors', async () => {
  mockQuery.mockResolvedValue({ rows: [{ row_id: 'deleted-point', action: 'DELETE', user_id: 'other-team-member' }] })
  const response = await GET(request(`project_id=${projectId}`))
  expect(response.status).toBe(200)
  const data = await response.json() as { events: unknown[] }
  expect(data.events).toHaveLength(1)
  expect(mockQuery.mock.calls[0][0]).toContain('WHERE fae.project_id = $1')
  expect(mockQuery.mock.calls[0][0]).not.toContain('project_fieldbook_entries pfe')
  expect(mockQuery.mock.calls[0][1]).toEqual([projectId, 100])
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})

test('personal stream retains the authenticated actor filter when no project is requested', async () => {
  await GET(request('limit=900'))
  expect(mockQuery.mock.calls[0][0]).toContain('WHERE fae.user_id = $1')
  expect(mockQuery.mock.calls[0][1]).toEqual(['test-user', 500])
})

test.each(['limit=NaN', 'limit=-1', 'limit=0', 'limit=2.5', 'limit=1e3', 'project_id=invalid'])('rejects %s before querying', async query => {
  expect((await GET(request(query))).status).toBe(400)
  expect(mockQuery).not.toHaveBeenCalled()
})

test('empty or inaccessible history cannot return a verified chain', async () => {
  const response = await POST(new NextRequest('http://localhost/api/fieldbook/audit', {
    method: 'POST', body: JSON.stringify({ row_id: projectId, table_name: 'survey_points' }),
  }))
  expect(await response.json()).toMatchObject({ valid: false, events: 0, scope: 'predecessor-links-only' })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
