/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db, setRlsContext } from '@/lib/db'
import { GET, POST } from '@/app/api/project/[id]/setout/route'
import { recordEvidenceEvent } from '@/lib/observations/observationBatches'
import { SRID_21037 } from '@/lib/map/projectionConstants'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) =>
    async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, {
      ...ctx, body: req.method === 'POST' ? await req.json() : undefined,
    }),
}))
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn(), getClient: jest.fn() },
  setRlsContext: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/observations/observationBatches', () => ({
  recordEvidenceEvent: jest.fn().mockResolvedValue(undefined),
}))

const query = db.query as jest.Mock
const getClient = db.getClient as jest.Mock
const mockSetRlsContext = setRlsContext as jest.Mock
const request = (url: string, body?: unknown) => new NextRequest(url, body === undefined
  ? { method: 'GET' }
  : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const context = () => ({ params: Promise.resolve({ id: 'project-1' }), userId: 'alice' })
const projectCrs = { utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960' }

beforeEach(() => {
  query.mockReset()
  getClient.mockReset()
  mockSetRlsContext.mockReset().mockResolvedValue(undefined)
  jest.mocked(recordEvidenceEvent).mockClear()
})

test('GET and POST refuse access before any set-out data query for another owner', async () => {
  query.mockResolvedValueOnce({ rows: [{ user_id: 'bob' }] })
  const getResponse = await GET(request('https://metardu.space/api/project/project-1/setout'), context())
  expect(getResponse.status).toBe(403)
  expect(query).toHaveBeenCalledTimes(1)

  query.mockReset().mockResolvedValueOnce({ rows: [{ user_id: 'bob' }] })
  const postResponse = await POST(
    request('https://metardu.space/api/project/project-1/setout', { action: 'record_verticality' }),
    context(),
  )
  expect(postResponse.status).toBe(403)
  expect(query).toHaveBeenCalledTimes(1)
})

test('point and register reads are scoped to this project and only the current revision', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
    .mockResolvedValueOnce({ rows: [{ label: 'A1', easting: 500000, northing: 9950000, design_rl: null, point_type: 'pile' }] })
    .mockResolvedValueOnce({ rows: [{ definition_id: 'definition-1', label: 'A1', result: 'PASS' }] })

  const response = await GET(
    request('https://metardu.space/api/project/project-1/setout?definitionId=definition-1'),
    context(),
  )
  const body = await response.json() as {
    data: {
      points: unknown[]
      register: Array<{ definition_id: string }>
    }
  }
  const calls = query.mock.calls as unknown as Array<[string, unknown[]?]>

  expect(response.status).toBe(200)
  expect(body.data.points).toHaveLength(1)
  expect(body.data.register[0].definition_id).toBe('definition-1')
  expect(calls[1]?.[0]).toContain('d.project_id = $2')
  expect(calls[1]?.[0]).toContain('SELECT MAX(current.revision)')
  expect(calls[2]?.[0]).toContain('o.project_id = $2')
})

test('a definition from another project cannot receive a verticality record', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
    .mockResolvedValueOnce({ rows: [projectCrs] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })

  const response = await POST(
    request('https://metardu.space/api/project/project-1/setout', {
      action: 'record_verticality',
      definitionId: 'definition-from-project-2',
      label: 'C1',
      baseEasting: 500000,
      baseNorthing: 9950000,
      topEasting: 500000,
      topNorthing: 9950000,
    }),
    context(),
  )

  expect(response.status).toBe(404)
  expect(query).toHaveBeenCalledTimes(4)
  const calls = query.mock.calls as unknown as Array<[string, unknown[]?]>
  expect(calls[3]?.[0]).toContain('project_id = $2')
  expect(recordEvidenceEvent).not.toHaveBeenCalled()
})

test('a saved grid uses the registered CRS and preserves an unknown design RL as null', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
    .mockResolvedValueOnce({ rows: [projectCrs] })
    .mockResolvedValueOnce({ rows: [] })

  const clientQuery = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition-1' }] }
    if (sql.includes('COALESCE(MAX(revision)')) return { rows: [{ revision: 1 }] }
    return { rows: [] }
  })
  getClient.mockResolvedValue({ query: clientQuery })

  const response = await POST(
    request('https://metardu.space/api/project/project-1/setout', {
      action: 'save_definition',
      name: 'Foundation grid',
      structureType: 'pile',
      originEasting: 500000,
      originNorthing: 9950000,
      originRL: null,
      rows: 1,
      columns: 1,
      rowSpacing: 3,
      columnSpacing: 3,
      startLabel: 'A1',
      labelRowsAs: 'alpha',
      labelColumnsAs: 'numeric',
    }),
    context(),
  )
  const body = await response.json() as { data: { crs: string } }
  const clientCalls = clientQuery.mock.calls as unknown as Array<[string, unknown[]?]>
  const definitionInsert = clientCalls.find(([sql]) => sql.includes('INSERT INTO setout_definitions'))
  const definitionInsertIndex = clientCalls.findIndex(([sql]) => sql.includes('INSERT INTO setout_definitions'))
  const pointInsert = clientCalls.find(([sql]) => sql.includes('INSERT INTO setout_points'))

  expect(response.status).toBe(201)
  expect(body.data.crs).toBe(SRID_21037)
  expect(definitionInsert?.[1]?.[16]).toBe(SRID_21037)
  expect(pointInsert?.[1]?.[7]).toBeNull()
  expect(mockSetRlsContext).toHaveBeenCalledWith(expect.objectContaining({ query: clientQuery }))
  expect(mockSetRlsContext.mock.invocationCallOrder[0]).toBeGreaterThan(clientQuery.mock.invocationCallOrder[0])
  expect(mockSetRlsContext.mock.invocationCallOrder[0]).toBeLessThan(clientQuery.mock.invocationCallOrder[definitionInsertIndex])
})

test('client-supplied tolerance overrides cannot change the recorded judgement', async () => {
  query
    .mockResolvedValueOnce({ rows: [{ user_id: 'alice' }] })
    .mockResolvedValueOnce({ rows: [projectCrs] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9860000, design_rl: null, revision: 1, tolerance_profile_id: null, definition_metadata: null }] })
    .mockResolvedValueOnce({ rows: [{ id: 'shot-1' }] })

  const response = await POST(
    request('https://metardu.space/api/project/project-1/setout', {
      action: 'record_observation',
      definitionId: 'definition-1',
      label: 'A1',
      designEasting: 500000,
      designNorthing: 9860000,
      designRL: null,
      designRevision: 1,
      observedEasting: 500000.02,
      observedNorthing: 9860000,
      toleranceHorizontalM: 100,
      toleranceVerticalM: 100,
    }),
    context(),
  )
  const body = await response.json() as { data: { result: string } }
  const calls = query.mock.calls as unknown as Array<[string, unknown[]?]>
  const insertValues = calls[4]?.[1] as unknown[]

  expect(response.status).toBe(201)
  expect(body.data.result).toBe('WARN')
  expect(insertValues[6]).toBeNull() // no design RL was supplied
  expect(insertValues[9]).toBeNull() // no observed RL was supplied
  expect(insertValues[16]).toBeNull() // no approved profile is attached to this definition
  expect(insertValues[17]).toBe('METARDU-1')
  expect(insertValues[18]).toBe(0.01)
  expect(insertValues[19]).toBe(0.005)
})
