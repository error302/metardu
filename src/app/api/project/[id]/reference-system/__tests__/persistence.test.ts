/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { db, setRlsContext } from '@/lib/db'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { projectCache } from '@/lib/cache/memory-cache'
import { buildProjectReferenceSystem, toReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'
import { GET, PUT } from '../route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest, ctx: unknown) => { try { return await handler(req, ctx) } catch { return NextResponse.json({ error: 'Unconfirmed write' }, { status: 500 }) } },
  apiSuccess: (data: unknown) => NextResponse.json(data),
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), getClient: jest.fn() }, setRlsContext: jest.fn() }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn(), requireProjectReadAccess: jest.fn() }))
jest.mock('@/lib/cache/memory-cache', () => ({ CacheKeys: { project: (id: string) => id }, projectCache: { invalidate: jest.fn() } }))

const form = { datum: 'WGS84', utmZone: 37, hemisphere: 'S' as const, verticalDatum: 'Synthetic BM', distanceMode: 'grid' as const, coordinatePrecision: 3 }
const saved = toReferenceSystemRow('project', { prs: buildProjectReferenceSystem(form) }, 'owner')
const ctx = { userId: 'owner', params: { id: 'project' }, session: null }
const request = new NextRequest('http://127.0.0.1:3021/api/project/project/reference-system', { method: 'PUT' })
const invoke = (body: unknown = form) => PUT(request, { ...ctx, body } as never)

interface Scenario { owner?: string | null; missing?: boolean; emptyReference?: boolean; invalidReference?: boolean; shortLegacy?: boolean; rollbackFails?: boolean }
function clientFor(scenario: Scenario = {}) {
  const release = jest.fn()
  const query = jest.fn(async (sql: string, values?: unknown[]) => {
    if (scenario.rollbackFails && ['BEGIN', 'ROLLBACK'].includes(sql)) throw new Error('Synthetic lost connection')
    if (sql.includes('SELECT') && sql.includes('FROM projects')) return { rows: scenario.missing ? [] : [{ user_id: scenario.owner === undefined ? 'owner' : scenario.owner }], rowCount: scenario.missing ? 0 : 1 }
    if (sql.includes('INSERT INTO project_reference_systems')) {
      const columns = sql.match(/\(([^)]+)\)/)?.[1].split(',').map(column => column.trim()) ?? []
      const returned = Object.fromEntries(columns.map((column,index) => [column, values?.[index]]))
      return { rows: scenario.emptyReference ? [] : [{ ...saved, ...returned, ...(scenario.invalidReference ? { horizontal_crs: 'EPSG:4326' } : {}) }], rowCount: scenario.emptyReference ? 0 : 1 }
    }
    return { rows: [], rowCount: scenario.shortLegacy && sql.includes('UPDATE projects') ? 0 : 1 }
  })
  jest.mocked(db.getClient).mockResolvedValue({ query, release } as never)
  return { query, release }
}
beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ ok: true, projectUserId: 'owner' })
  jest.mocked(requireProjectReadAccess).mockResolvedValue({ ok: true, projectUserId: 'owner' })
  jest.mocked(setRlsContext).mockResolvedValue(undefined)
})

it.each(['new-owner', null])('refuses a committed owner change to %s before declaring a reference', async owner => {
  const client = clientFor({ owner })
  expect((await invoke()).status).toBe(403)
  expect(client.query.mock.calls.some(([sql]) => /INSERT INTO|UPDATE projects/.test(sql))).toBe(false)
  expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  expect(client.release).toHaveBeenCalledTimes(1)
  expect(projectCache.invalidate).not.toHaveBeenCalled()
})
it('refuses a project removed before declaration persistence', async () => {
  const client = clientFor({ missing: true })
  expect((await invoke()).status).toBe(404)
  expect(client.query).not.toHaveBeenCalledWith('COMMIT')
  expect(client.release).toHaveBeenCalledTimes(1)
})
it.each([{ emptyReference: true }, { invalidReference: true }, { shortLegacy: true }])('rolls back an unconfirmed canonical or legacy write: %j', async scenario => {
  const client = clientFor(scenario)
  expect((await invoke()).status).toBe(500)
  expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  expect(client.query).not.toHaveBeenCalledWith('COMMIT')
  expect(client.release).toHaveBeenCalledTimes(1)
  expect(projectCache.invalidate).not.toHaveBeenCalled()
})
it('discards its client if rollback cannot establish a clean transaction', async () => {
  const client = clientFor({ rollbackFails: true })
  expect((await invoke()).status).toBe(500)
  expect(client.release).toHaveBeenCalledWith(true)
})
it('commits both representations before invalidating cached project data', async () => {
  const client = clientFor()
  const response = await invoke()
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(client.query.mock.calls.some(([sql]) => sql.includes('FROM projects') && sql.includes('FOR UPDATE'))).toBe(true)
  expect(projectCache.invalidate).toHaveBeenCalledWith('project')
  expect(client.release).toHaveBeenCalledTimes(1)
})
it.each([
  { combinedScaleFactor: 'unknown', csfProvenance: 'surveyor' },
  { combinedScaleFactor: true, csfProvenance: 'surveyor' },
  { coordinatePrecision: 'not measured' }, { coordinatePrecision: [] },
  { utmZone: [37] }, { csfReference: { easting: 500000 } },
  { csfReference: { easting: 500000, northing: 'bad' } },
  { csfReference: { easting: 500000, northing: 9800000, height: 'unknown' } },
  { csfReference: [] }, { verticalDatum: { name: 'Synthetic BM' } },
])('refuses invalid supplied values without deleting their meaning: %j', async patch => {
  clientFor()
  expect((await invoke({ ...form, ...patch })).status).toBe(400)
  expect(db.getClient).not.toHaveBeenCalled()
})
it('does not expose a declaration after ownership changes between access check and read', async () => {
  jest.mocked(db.query).mockResolvedValue({ rows: [{ ...saved, project_owner: 'new-owner', reference: saved }], rowCount: 1 } as never)
  expect((await GET(request, ctx as never)).status).toBe(403)
})
it('does not call a missing project an undeclared reference', async () => {
  jest.mocked(db.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)
  expect((await GET(request, ctx as never)).status).toBe(404)
})
