/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '../route'
import { searchResponseSchema, getSearchHitHref } from '@/lib/search/contract'

const mockQuery = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, unknown[]>()
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) } }))
jest.mock('@/lib/logger', () => ({ log: jest.fn() }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))

beforeEach(() => mockQuery.mockReset())
const request = (query: string) => GET(new NextRequest(`http://localhost/api/search?q=road${query}`), { params: Promise.resolve({}) })

it('returns a shared-contract submission result with a navigable project identity', async () => {
  mockQuery.mockResolvedValue({ rows: [{ id: 's1', project_id: 'p1', title: 'Road submission', status: 'draft', survey_type: 'engineering', created_at: '2026-10-18', score: 0.8 }] })
  const res = await request('&type=submissions')
  expect(res.status).toBe(200)
  const body = searchResponseSchema.parse(await res.json())
  expect(getSearchHitHref(body.results[0].hits[0])).toBe('/project/p1/submission')
  expect(mockQuery.mock.calls[0][0]).toContain('s.project_id')
})

it('retains successful groups and explicitly marks a failed group unavailable', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Road project', score: 1 }] })
    .mockRejectedValueOnce(new Error('Submission query failed'))
    .mockResolvedValue({ rows: [] })
  const res = await request('')
  expect(res.status).toBe(200)
  const body = searchResponseSchema.parse(await res.json())
  expect(body.results.find(group => group.type === 'projects')?.hits[0].title).toBe('Road project')
  expect(body.results.find(group => group.type === 'submissions')).toMatchObject({ total: 0, hits: [], unavailable: true })
})

it('reports service failure instead of a successful empty result if every query fails', async () => {
  mockQuery.mockRejectedValue(new Error('Database unavailable'))
  const res = await request('')
  expect(res.status).toBe(503)
  expect(await res.json()).toMatchObject({ code: 'SEARCH_UNAVAILABLE' })
})
