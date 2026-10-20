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
const crs = 'EPSG:' + (32700 + 37)
const control = { name: 'A', easting: 500000, northing: 9900000, crs, notes: 'Unverified coordinate', retainedMetadata: 'preserve' }
const project = { id: 'project', boundary_data: { startControl: control }, datum: 'WGS84', utm_zone: 37, hemisphere: 'S' }
const reference = { horizontal_crs: crs, datum_name: 'WGS 84', distance_mode: 'grid', coordinate_precision: 3 }
const request = (revision = fieldBookRevision(original, control), extra: object = {}) => new NextRequest('http://localhost/api/project/project/fieldbook', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, rows: [{ station: 'A', distance: '11' }], ...extra }),
})

function transactionQuery() {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>().mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects')) return { rows: [project] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [reference] }
    if (sql.includes('FROM project_fieldbook_entries')) return { rows: original }
    return { rows: [] }
  })
  mockTransaction.mockImplementation(async callback => callback({ query } as never))
  return query
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ ok: true, projectUserId: 'owner' })
})

it('returns the existing records with their content-bound read revision', async () => {
  mockQuery.mockImplementation(async (sql) => ({ rows: sql.includes('FROM projects') ? [project] : sql.includes('FROM project_reference_systems') ? [reference] : original }) as never)
  const response = await GET(new NextRequest('http://localhost/api/project/project/fieldbook'), { params: Promise.resolve({ id: 'project' }) })
  expect(await response.json()).toEqual({ data: original, startPoint: control, projectCrs: crs, revision: fieldBookRevision(original, control) })
})

it('rejects stale revisions before any row or derived-document mutation', async () => {
  const query = transactionQuery()
  await expect(PUT(request('f'.repeat(64)), { params: Promise.resolve({ id: 'project' }) })).rejects.toMatchObject({ statusCode: 409 })
  expect(query).toHaveBeenCalledTimes(3)
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

it('rechecks ownership on the locked project before replacing any rows', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] })
  mockTransaction.mockImplementation(async callback => callback({ query } as never))
  await expect(PUT(request(), { params: Promise.resolve({ id: 'project' }) })).rejects.toMatchObject({ statusCode: 409 })
  expect(query).toHaveBeenCalledTimes(2)
  expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['project', 'owner'])
})

it('includes the starting coordinate in concurrency detection even when no row changed', async () => {
  const query = transactionQuery()
  await expect(PUT(request(fieldBookRevision(original, { ...control, easting: 500001 })), { params: Promise.resolve({ id: 'project' }) })).rejects.toMatchObject({ statusCode: 409 })
  expect(query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true)
})

it('preserves all starting-control metadata when the client edits only rows', async () => {
  const query = transactionQuery()
  const response = await PUT(request(), { params: Promise.resolve({ id: 'project' }) })
  expect(await response.json()).toMatchObject({ saved: true, revision: fieldBookRevision(original, control) })
  const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE projects'))
  expect(update?.[1]).toEqual(['project', '{}'])
})

it('saves an explicitly bound starting coordinate and invalidates derived geometry atomically', async () => {
  const query = transactionQuery()
  const next = { name: 'A', easting: 500001, northing: 9900001, crs, notes: 'Simulation only' }
  const response = await PUT(request(undefined, { startPoint: next }), { params: Promise.resolve({ id: 'project' }) })
  expect(await response.json()).toMatchObject({ saved: true, revision: fieldBookRevision(original, next) })
  const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE projects'))
  expect(update?.[0]).toContain("'adjustedStations'")
  expect(update?.[1]).toEqual(['project', JSON.stringify({ startControl: next })])
})

it.each([
  { ...control, crs: 'EPSG:' + (32700 + 36) },
  { ...control, name: 'OTHER' },
  { ...control, easting: 0 },
])('rejects a mismatched or out-of-range starting coordinate before changing rows', async startPoint => {
  const query = transactionQuery()
  await expect(PUT(request(undefined, { startPoint }), { params: Promise.resolve({ id: 'project' }) })).rejects.toMatchObject({ statusCode: 409 })
  expect(query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true)
})
