/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET, PUT } from './route'
import { db } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { fieldBookRevision } from '@/lib/survey/fieldBookRevision'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn() }))
// Exercise the route's data transaction independently of session transport.
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (req: NextRequest, context: unknown) => unknown) =>
  async (req: NextRequest) => handler(req, { params: { id: 'project' }, userId: 'owner', body: req.method === 'PUT' ? await req.json() as unknown : {} }),
}))

const original = [{ id: 'row-1', station: 'A', row_index: 0, raw_data: { distance: '10' }, updated_at: '2026-10-20T00:00:00Z' }]
const mockQuery = jest.mocked(db.query)
const mockTransaction = jest.mocked(db.transaction)
const request = (revision = fieldBookRevision(original)) => new NextRequest('http://localhost/api/project/project/fieldbook', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, rows: [{ station: 'A', distance: '11' }] }),
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ ok: true, projectUserId: 'owner' })
})

it('returns the existing records with their content-bound read revision', async () => {
  mockQuery.mockResolvedValue({ rows: original } as never)
  const response = await GET(new NextRequest('http://localhost/api/project/project/fieldbook'), { params: Promise.resolve({ id: 'project' }) })
  expect(await response.json()).toEqual({ data: original, revision: fieldBookRevision(original) })
})

it('rejects stale revisions before any row or derived-document mutation', async () => {
  const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'project' }] }).mockResolvedValueOnce({ rows: original })
  mockTransaction.mockImplementation(async callback => callback({ query } as never))
  await expect(PUT(request('f'.repeat(64)), { params: Promise.resolve({ id: 'project' }) })).rejects.toMatchObject({ statusCode: 409 })
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true)
})

it('requires a read revision rather than accepting a blind replacement', async () => {
  const response = await PUT(new NextRequest('http://localhost/api/project/project/fieldbook', {
    method: 'PUT', body: JSON.stringify({ rows: [] }), headers: { 'Content-Type': 'application/json' },
  }), { params: Promise.resolve({ id: 'project' }) })
  expect(response.status).toBe(400)
  expect(mockTransaction).not.toHaveBeenCalled()
})

it('does not enter a write transaction for a different owner', async () => {
  jest.mocked(requireProjectOwnership).mockResolvedValue({ ok: false, error: new Response(null, { status: 403 }) as never })
  const response = await PUT(request(), { params: Promise.resolve({ id: 'project' }) })
  expect(response.status).toBe(403)
  expect(mockTransaction).not.toHaveBeenCalled()
})
