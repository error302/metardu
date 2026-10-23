/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '../route'
import { db, setRlsContext } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) =>
    async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, body: await req.json() }),
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), getClient: jest.fn() }, setRlsContext: jest.fn() }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn() }))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn() }))
jest.mock('@/lib/workspaces/stageReference', () => ({
  resolveStageReference: (row: Record<string, unknown>) => ({
    code: row?.horizontal_crs, verticalDatum: row?.vertical_datum, distanceMode: row?.distance_mode,
  }),
}))

const reference = { horizontal_crs: 'EPSG:32737', vertical_datum: 'Synthetic BM', distance_mode: 'grid' }
const project = {
  user_id: 'owner', utm_zone: 37, hemisphere: 'S', datum: 'WGS84',
  engineering_data: { drainage: {
    projectCrs: 'EPSG:32737', minimumCoverM: 1.2, setoutIntervalM: 50,
    manholes: [
      { id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102, invertLevelOut: 100, pipeOutsideDiameterOut: 315 },
      { id: 'B', name: 'MH-B', chainage: 200, easting: 500100, northing: 9800000, coverLevel: 101, invertLevelIn: 99 },
    ],
  } },
}
const drainage = { action: 'save_drainage_definition' }
const grid = {
  action: 'save_definition', name: 'Synthetic grid', originEasting: 500000, originNorthing: 9800000,
  originRL: 0, rows: 2, columns: 2, rowSpacing: 5, columnSpacing: 6, startLabel: 'A1', labelRowsAs: 'alpha', labelColumnsAs: 'numeric',
}
const variants = [{ name: 'drainage', body: drainage, count: 3 }, { name: 'grid', body: grid, count: 4 }]
const invoke = (body: Record<string, unknown>) => POST(new NextRequest('http://127.0.0.1:3021/api/project/project/setout', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: { id: 'project' }, userId: 'owner' } as never)

interface Scenario {
  owner?: string | null
  reference?: Record<string, unknown>
  missingProject?: boolean
  missingDefinition?: boolean
  shortInsert?: boolean
  shortDefinitionUpdate?: 'geometry' | 'metadata'
  failAt?: string
  failRollback?: boolean
}
function transaction(scenario: Scenario = {}) {
  const release = jest.fn()
  const query = jest.fn(async (sql: string, values?: unknown[]) => {
    if (scenario.failAt && sql.includes(scenario.failAt)) throw new Error('Synthetic database failure')
    if (scenario.failRollback && sql === 'ROLLBACK') throw new Error('Synthetic lost database connection')
    if (sql.includes('FROM project_reference_systems')) return { rows: [scenario.reference ?? reference], rowCount: 1 }
    if (sql.includes('FROM projects')) return { rows: scenario.missingProject ? [] : [{ ...project, user_id: scenario.owner === undefined ? 'owner' : scenario.owner }], rowCount: scenario.missingProject ? 0 : 1 }
    if (sql.includes('SELECT id FROM setout_definitions')) return { rows: scenario.missingDefinition ? [] : [{ id: 'definition' }], rowCount: scenario.missingDefinition ? 0 : 1 }
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition' }], rowCount: 1 }
    if (sql.includes('UPDATE setout_definitions') && scenario.shortDefinitionUpdate
      && (scenario.shortDefinitionUpdate === 'metadata') === sql.includes('tolerance_profile_id')) return { rows: [], rowCount: 0 }
    if (sql.includes('MAX(revision)')) return { rows: [{ revision: 2 }], rowCount: 1 }
    if (sql.includes('INSERT INTO setout_points')) return { rows: [], rowCount: scenario.shortInsert ? 0 : ((values?.length ?? 2) - 2) / 8 }
    return { rows: [], rowCount: 1 }
  })
  jest.mocked(db.getClient).mockResolvedValue({ query, release } as never)
  return { query, release }
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(requireProjectOwnership).mockResolvedValue({ ok: true, projectUserId: 'owner' })
  jest.mocked(setRlsContext).mockResolvedValue(undefined)
  jest.mocked(db.query).mockImplementation(async (sql: string) => ({
    rows: sql.includes('project_reference_systems') ? [reference] : [project], rowCount: 1,
    command: 'SELECT', oid: 0, fields: [],
  }) as never)
})

describe.each(variants)('$name generation persistence', ({ body, count }) => {
  it('returns its connection after a complete committed schedule', async () => {
    const client = transaction()
    const response = await invoke(body)
    const result: unknown = await response.json()
    expect({ status: response.status, result }).toMatchObject({ status: 201, result: { data: { revision: 2, pointCount: count } } })
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('rolls back and releases after a failed point insertion', async () => {
    const client = transaction({ failAt: 'INSERT INTO setout_points' })
    expect((await invoke(body)).status).toBe(500)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query).not.toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('refuses a partially persisted schedule instead of reporting the calculated count', async () => {
    const client = transaction({ shortInsert: true })
    expect((await invoke(body)).status).toBe(500)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query).not.toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it.each(['new-owner', null])('checks the locked owner before writing when it changes to %s', async owner => {
    const client = transaction({ owner })
    expect((await invoke(body)).status).toBe(403)
    expect(client.query.mock.calls.some(([sql]) => /INSERT INTO|UPDATE setout/.test(sql))).toBe(false)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('releases after discovering that the project disappeared', async () => {
    const client = transaction({ missingProject: true })
    expect((await invoke(body)).status).toBe(404)
    expect(client.query).not.toHaveBeenCalledWith('COMMIT')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'height datum', row: { ...reference, vertical_datum: 'Different benchmark' } },
    { name: 'benchmark provenance with the same displayed datum', row: { ...reference, benchmark_basis: 'Different source record' } },
  ])('refuses changes to $name between preparation and persistence', async ({ row }) => {
    const client = transaction({ reference: row })
    expect((await invoke(body)).status).toBe(409)
    expect(client.query.mock.calls.some(([sql]) => /INSERT INTO|UPDATE setout/.test(sql))).toBe(false)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('releases even when BEGIN or rollback fails', async () => {
    const client = transaction({ failAt: 'BEGIN', failRollback: true })
    expect((await invoke(body)).status).toBe(500)
    expect(client.release).toHaveBeenCalledTimes(1)
    expect(client.release).toHaveBeenCalledWith(true)
  })

  it('serializes generation before reading the current source', async () => {
    const client = transaction()
    await invoke(body)
    const calls = client.query.mock.calls.map(([sql]) => sql)
    const lockIndex = calls.indexOf('SELECT pg_advisory_xact_lock(hashtext($1))')
    expect(lockIndex).toBeGreaterThan(calls.indexOf('BEGIN'))
    expect(calls.findIndex(sql => sql.includes('FROM projects') && sql.includes('FOR SHARE'))).toBeGreaterThan(lockIndex)
  })
})

it('returns its connection after a missing grid definition', async () => {
  const client = transaction({ missingDefinition: true })
  expect((await invoke({ ...grid, definitionId: 'missing' })).status).toBe(404)
  expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  expect(client.release).toHaveBeenCalledTimes(1)
})

it.each(['geometry', 'metadata'] as const)('rejects an unconfirmed grid %s update before storing targets', async kind => {
  const client = transaction({ shortDefinitionUpdate: kind })
  expect((await invoke({ ...grid, ...(kind === 'geometry' ? { definitionId: 'definition' } : {}) })).status).toBe(500)
  expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO setout_points'))).toBe(false)
  expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  expect(client.release).toHaveBeenCalledTimes(1)
})
