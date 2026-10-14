/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { GET, POST } from '@/app/api/project/[id]/pipeline-asbuilt/route'
import { createPipelineCapture, assertPipelineCapture } from '@/lib/engineering/pipelineCapture'
import type { SavedPipelineBatch } from '@/lib/engineering/pipelineCapture'
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) => async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, body: req.method === 'POST' ? await req.json() : undefined }) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
const query = db.query as jest.Mock
const calls = () => query.mock.calls as unknown as Array<[string, unknown[]]>
const projectId = 'e2908a64-bd40-4975-acd5-037a58deecbf'
const requestId = '382925b1-44b1-4479-a282-e5b4681d357c'
const batchId = '4c186ff0-ddbb-4b52-8d11-54c63f2e970d'
const rawCsv = 'point_id,chainage_m,invert_rl_m,ground_rl_m,internal_diameter_mm,outside_diameter_mm\nP1,0,10,10.2,300,400\nP2,50,9.5,11,300,400'
const input = { rawCsv, metadata: { route: 'Drain A', designReference: '', verticalReference: '', observer: '', instrument: '' }, criterion: null }
const body = { ...input, clientBatchId: requestId }
const ctx = { params: { id: projectId }, userId: 'alice' }
const post = (value: unknown = body) => POST(new NextRequest(`https://metardu.space/api/project/${projectId}/pipeline-asbuilt`, { method: 'POST', body: JSON.stringify(value) }), ctx)
const get = (suffix = '') => GET(new NextRequest(`https://metardu.space/api/project/${projectId}/pipeline-asbuilt${suffix}`), ctx)
beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id')) return { rows: [{ user_id: 'alice' }] }
    if (sql.includes('INSERT INTO pipeline_asbuilt_batches')) return { rows: [{ id: batchId, project_id: projectId, actor_id: 'alice', client_batch_id: requestId, input_hash: createPipelineCapture(input).inputHash, capture: createPipelineCapture(input).capture, project_name: 'Private drain', reference_snapshot: null, recorded_at: '2026-10-14T12:00:00Z' }] }
    return { rows: [] }
  })
})
test('server retains raw observations and calculates signed cover without invented reference or criterion', async () => {
  const response = await post()
  expect(response.status).toBe(201)
  const json = await response.json() as { data: SavedPipelineBatch }
  expect(json.data.capture.result.points[0].coverDepth).toBeCloseTo(-0.15)
  expect(json.data.capture.result.points[0].coverAdequate).toBeNull()
  expect(json.data.capture.metadata.verticalReference).toBe('')
  expect(json.data.reference_snapshot).toBeNull()
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  const insert = calls().find(([sql]) => sql.includes('INSERT INTO pipeline_asbuilt_batches'))
  expect(insert?.[0]).toContain('p.user_id = $2')
  expect(insert?.[0]).toContain('ON CONFLICT')
})
test('invalid data or client results cannot become a saved batch', async () => {
  for (const patch of [{ clientBatchId: undefined }, { rawCsv: rawCsv.replace('10.2', 'bad') }, { result: { certified: true } }, { criterion: { minimumCoverM: 1, source: '', revision: '' } }]) {
    expect((await post({ ...body, ...patch })).status).toBe(400)
  }
  expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO pipeline_asbuilt_batches'))).toBe(false)
})
test('other owners cannot read or save any pipeline evidence', async () => {
  query.mockResolvedValue({ rows: [{ user_id: 'bob' }] })
  expect((await post()).status).toBe(403)
  expect((await get()).status).toBe(403)
  expect(query.mock.calls.every(([sql]) => String(sql).includes('SELECT user_id'))).toBe(true)
})
test('matching retry returns the original record; changed retry conflicts', async () => {
  const saved = createPipelineCapture(input)
  query.mockImplementation(async (sql: string) => sql.includes('SELECT user_id') ? { rows: [{ user_id: 'alice' }] } : { rows: [{ id: batchId, input_hash: saved.inputHash, capture: saved.capture }] })
  const replay = await post()
  expect(replay.status).toBe(200)
  expect((await replay.json() as { replayed: boolean }).replayed).toBe(true)
  expect((await post({ ...body, rawCsv: rawCsv.replace('10.2', '12') })).status).toBe(409)
  expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false)
})
test('a concurrent delivery rereads the winning batch and never reports an unsaved success', async () => {
  const saved = createPipelineCapture(input)
  let reads = 0
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id')) return { rows: [{ user_id: 'alice' }] }
    if (sql.includes('client_batch_id =')) return { rows: reads++ ? [{ id: batchId, input_hash: saved.inputHash, capture: saved.capture }] : [] }
    return { rows: [] }
  })
  expect((await post()).status).toBe(200)
  query.mockImplementation(async (sql: string) => sql.includes('SELECT user_id') ? { rows: [{ user_id: 'alice' }] } : { rows: [] })
  expect((await post()).status).toBe(409)
})
test('missing migration is a retryable failure and malformed history cursors do not reach batch SQL', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT user_id')) return { rows: [{ user_id: 'alice' }] }
    throw Object.assign(new Error('relation missing'), { code: '42P01' })
  })
  expect((await post()).status).toBe(503)
  expect((await get()).status).toBe(503)
  expect((await get('?batchId=broken')).status).toBe(400)
})
test('history detail is constrained to its project and list excludes raw CSV payloads', async () => {
  await get(`?batchId=${batchId}`)
  const detail = calls().find(([sql]) => sql.includes('FROM pipeline_asbuilt_batches'))
  expect(detail?.[0]).toContain('project_id = $1')
  expect(detail?.[1]).toEqual([projectId, batchId])
  query.mockClear()
  await get()
  const list = calls().find(([sql]) => sql.includes('FROM pipeline_asbuilt_batches'))
  expect(list?.[0]).not.toContain('SELECT *')
  expect(list?.[0]).toContain('LIMIT 51')
})
test('retained arithmetic tampering, hash drift and unsupported algorithm versions cannot be exported as current results', async () => {
  const saved = createPipelineCapture(input)
  expect(assertPipelineCapture(JSON.parse(JSON.stringify(saved.capture)), saved.inputHash)).toEqual(saved.capture)
  const changed = { ...saved.capture, result: { ...saved.capture.result, points: saved.capture.result.points.map(point => ({ ...point, coverDepth: 999 })) } }
  expect(() => assertPipelineCapture(changed, saved.inputHash)).toThrow('left unchanged')
  expect(() => assertPipelineCapture(saved.capture, 'b'.repeat(64))).toThrow('left unchanged')
  expect(() => assertPipelineCapture({ ...saved.capture, result: { ...saved.capture.result, algorithmVersion: '1.0.0' } }, saved.inputHash)).toThrow('left unchanged')
  query.mockImplementation(async (sql: string) => sql.includes('SELECT user_id') ? { rows: [{ user_id: 'alice' }] } : { rows: [{ id: batchId, capture: changed, input_hash: saved.inputHash }] })
  expect((await get(`?batchId=${batchId}`)).status).toBe(409)
})
