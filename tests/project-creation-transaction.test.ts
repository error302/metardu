/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { db, setRlsContext } from '@/lib/db'
import { checkProjectLimit } from '@/lib/subscription/subscriptionEngine'
import { POST } from '@/app/api/projects/route'
const mockQuery = jest.fn<Promise<{rows:unknown[];rowCount:number}>,[sql:string,values?:unknown[]]>()
const mockRelease = jest.fn()
const mockClient = { query: mockQuery, release: mockRelease }
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), getClient: jest.fn() }, setRlsContext: jest.fn() }))
jest.mock('@/lib/subscription/subscriptionEngine', () => ({ checkProjectLimit: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
jest.mock('@/lib/api/handler', () => ({
  AppError: jest.requireActual<typeof import('@/lib/api/errors')>('@/lib/api/errors').AppError,
  apiHandler: (config: { schema: { safeParse: (value: unknown) => {success:boolean;data?:unknown} }; handler: (ctx: unknown) => Promise<NextResponse> }) => async (req: NextRequest) => {
    const parsed = config.schema.safeParse(await req.json() as unknown)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 422 })
    try { return await config.handler({ input: parsed.data, userId: 'owner', userEmail: 'synthetic@example.invalid' }) }
    catch (error: unknown) {
      const status=error&&typeof error==='object'&&'statusCode' in error&&typeof error.statusCode==='number'?error.statusCode:500
      return NextResponse.json({error:error instanceof Error?error.message:'Creation failed'},{status})
    }
  },
}))
const base = { name: 'Synthetic creation', survey_type: 'road' }
const drawing = { source: 'map-drawing', createdFrom: 'map-client', coordinateCrs: 'EPSG:4326', measurementCrs: 'EPSG:32737', drawnFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [39.63, -4.11] }, properties: { name: 'SYNTHETIC only' } }] }, drawnAreaSqM: 0, drawnPerimeterM: 0 }
const invoke = (body = base) => POST(new NextRequest('http://127.0.0.1/api/projects', { method: 'POST', body: JSON.stringify(body) }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(db.getClient).mockResolvedValue(mockClient as never)
  jest.mocked(checkProjectLimit).mockResolvedValue({ allowed: true })
  mockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('INSERT INTO projects') ? [{ id: 'new-project', name: base.name }] : sql.includes('INSERT INTO scheme_details') ? [{ project_id: 'new-project' }] : [], rowCount: 1 }))
  jest.mocked(db.query).mockRejectedValue(new Error('Creation must use its locked transaction client'))
})
test('creation checks the plan on the same client after acquiring the account lock', async () => {
  expect((await invoke()).status).toBe(201)
  expect(checkProjectLimit).toHaveBeenCalledWith('owner', 'synthetic@example.invalid', mockClient)
  expect(mockQuery.mock.calls[0][0]).toBe('BEGIN')
  expect(mockQuery.mock.calls[1]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))', ['project-create:owner']])
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  expect(setRlsContext).toHaveBeenCalledWith(mockClient)
  expect(mockRelease).toHaveBeenCalledTimes(1)
  expect(db.query).not.toHaveBeenCalled()
})
test('map drawing features and their coordinate provenance survive canonical creation', async () => {
  expect((await invoke({ ...base, datum: 'WGS84', utm_zone: 37, hemisphere: 'S', boundary_data: drawing } as typeof base)).status).toBe(201)
  const insert = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO projects'))
  if(!insert)throw new Error('Expected a canonical project insert')
  expect(insert[0]).toContain('boundary_data')
  const boundary = insert[1]?.find(value => typeof value === 'string' && value.includes('"drawnFeatures"'))
  expect(JSON.parse(String(boundary)) as unknown).toMatchObject(drawing)
  expect(JSON.parse(String(boundary)) as unknown).toHaveProperty('mapDrawing.referenceSource','selected_grid_preview')
})
test('plan denial rolls back before inserting a project', async () => {
  jest.mocked(checkProjectLimit).mockResolvedValue({ allowed: false, reason: 'Limit reached' })
  expect((await invoke()).status).toBe(402)
  expect(mockQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  expect(mockRelease).toHaveBeenCalledTimes(1)
})
test('a suppressed scheme insert rolls back the whole project without compensating deletion', async () => {
  mockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('INSERT INTO projects') ? [{ id: 'new-project', name: base.name }] : [], rowCount: sql.includes('INSERT INTO scheme_details') ? 0 : 1 }))
  expect((await invoke({ ...base, project_type: 'scheme' } as typeof base)).status).toBe(500)
  expect(mockQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  expect(mockQuery.mock.calls.some(([sql]) => sql.includes('DELETE FROM'))).toBe(false)
})
test('rollback failure destroys its connection and never reports success', async () => {
  mockQuery.mockRejectedValueOnce(new Error('begin failed')).mockRejectedValueOnce(new Error('rollback failed'))
  expect((await invoke()).status).toBe(500)
  expect(mockRelease).toHaveBeenCalledWith(true)
})
