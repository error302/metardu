/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { POST } from '@/app/api/project/[id]/setout/route'
import { createVerticalityCapture } from '@/lib/field/verticalityCapture'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) => async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, body: await req.json() }) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), getClient: jest.fn() }, setRlsContext: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn().mockResolvedValue(undefined) }))
const query = db.query as jest.Mock
const fixtureCrs = 'EPSG:21037'
const calls = () => query.mock.calls as unknown as Array<[string, unknown[]]>
type ResponseBody = { code?: string; data: { result: string; tiltRatio: number | null; captureSnapshot: { criteria: unknown }; replayed?: boolean } }
const body = { action: 'record_verticality', clientReadingId: 'd8aa0101-6066-4700-ae25-302c05d8bf81', label: 'C1', baseEasting: 500000, baseNorthing: 9800000, topEasting: 500000.004, topNorthing: 9800000, capturedAt: '2026-10-14T06:00:00Z' }
const request = (value: unknown) => new NextRequest('https://metardu.space/api/project/project-1/setout', { method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } })
const context = () => ({ params: Promise.resolve({ id: 'project-1' }), userId: 'alice' })
beforeEach(() => {
  jest.clearAllMocks()
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id')) return { rows: [{ user_id: 'alice' }] }
    if (sql.includes('SELECT utm_zone')) return { rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960' }] }
    if (sql.includes('INSERT INTO verticality_readings')) return { rows: [{ id: 'reading-1' }] }
    return { rows: [] }
  })
})
test('missing height and criteria save as unknown numerical evidence, with no inferred ratio or standard', async () => {
  const response = await POST(request(body), context())
  const result = await response.json() as ResponseBody
  expect(response.status).toBe(201)
  expect(result.data.result).toBe('INFO')
  expect(result.data.tiltRatio).toBeNull()
  expect(result.data.captureSnapshot.criteria).toBeNull()
  const insert = calls().find(([sql]) => sql.includes('INSERT INTO verticality_readings'))
  expect(insert?.[0]).toContain('capture_snapshot')
  expect(insert?.[1]).toContain(body.clientReadingId)
})
test('invalid optional levels and missing retry identity block the write', async () => {
  for (const patch of [{ topRL: 'bad' }, { clientReadingId: undefined }]) {
    const response = await POST(request({ ...body, ...patch }), context())
    expect(response.status).toBe(400)
  }
  expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO verticality_readings'))).toBe(false)
})
test('unapplied capture schema returns a retryable error rather than a false save', async () => {
  const implementation = query.getMockImplementation()
  query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes('client_reading_id')) throw Object.assign(new Error('column missing'), { code: '42703' })
    return (await implementation?.(sql, values)) as unknown
  })
  const response = await POST(request(body), context())
  expect(response.status).toBe(503)
  expect((await response.json() as ResponseBody).code).toBe('VERTICALITY_CAPTURE_SCHEMA_NOT_READY')
})
test('matching replay preserves the original record, while changed observations conflict', async () => {
  const snapshot = createVerticalityCapture({ projectId: 'project-1', definitionId: null, label: body.label, level: null, horizontalCrs: fixtureCrs, capturedCrs: null, verticalDatum: null, capturedVerticalDatum: null, capturedAt: body.capturedAt, base: { easting: body.baseEasting, northing: body.baseNorthing, rl: null }, top: { easting: body.topEasting, northing: body.topNorthing, rl: null }, horizontalUncertaintyM: null, heightUncertaintyM: null, criteria: null, instrument: null, notes: null })
  const implementation = query.getMockImplementation()
  query.mockImplementation(async (sql: string, values: unknown[]): Promise<unknown> => sql.includes('client_reading_id') ? { rows: [{ id: 'original', capture_snapshot: snapshot }] } : (await implementation?.(sql, values)) as unknown)
  const replay = await POST(request(body), context())
  expect(replay.status).toBe(200)
  expect((await replay.json() as ResponseBody).data.replayed).toBe(true)
  const changed = await POST(request({ ...body, topEasting: body.topEasting + 0.001 }), context())
  expect(changed.status).toBe(409)
  expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO verticality_readings'))).toBe(false)
})
test('unknown actions cannot fall through into plumb observation writes', async () => {
  const response = await POST(request({ ...body, action: 'unsupported' }), context())
  expect(response.status).toBe(400)
  expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO verticality_readings'))).toBe(false)
})
test('a queued reading cannot be delivered under a different signed-in account', async () => {
  const response = await POST(request({ ...body, capturedBy: 'bob' }), context())
  expect(response.status).toBe(403)
  expect(calls().some(([sql]) => sql.includes('INSERT INTO verticality_readings'))).toBe(false)
})
test('a matching concurrent insert returns the saved reading without a duplicate record', async () => {
  const snapshot = createVerticalityCapture({ projectId: 'project-1', definitionId: null, label: body.label, level: null, horizontalCrs: fixtureCrs, capturedCrs: null, verticalDatum: null, capturedVerticalDatum: null, capturedAt: body.capturedAt, base: { easting: body.baseEasting, northing: body.baseNorthing, rl: null }, top: { easting: body.topEasting, northing: body.topNorthing, rl: null }, horizontalUncertaintyM: null, heightUncertaintyM: null, criteria: null, instrument: null, notes: null })
  const implementation = query.getMockImplementation()
  let reads = 0
  query.mockImplementation(async (sql: string, values: unknown[]): Promise<unknown> => {
    if (sql.includes('SELECT id, capture_snapshot')) return { rows: reads++ === 0 ? [] : [{ id: 'concurrent', capture_snapshot: snapshot }] }
    if (sql.includes('INSERT INTO verticality_readings')) return { rows: [] }
    return (await implementation?.(sql, values)) as unknown
  })
  const response = await POST(request(body), context())
  expect(response.status).toBe(200)
  expect((await response.json() as ResponseBody).data.replayed).toBe(true)
  expect(calls().filter(([sql]) => sql.includes('INSERT INTO verticality_readings'))).toHaveLength(1)
  expect(calls().find(([sql]) => sql.includes('INSERT INTO verticality_readings'))?.[0]).toContain('DO NOTHING')
})
