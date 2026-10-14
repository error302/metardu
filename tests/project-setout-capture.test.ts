/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { POST } from '@/app/api/project/[id]/setout/route'
import { parseSetoutCaptureSnapshot } from '@/lib/field/setoutCapture'
import archived from '@/test-utils/fixtures/setout-capture-replay-v1.json'
import { defined } from '@/test-utils/defined'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) =>
    async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, body: await req.json() }),
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), getClient: jest.fn() }, setRlsContext: jest.fn() }))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn().mockResolvedValue(undefined) }))
const query = jest.mocked(db.query)
const crs = 'EPSG:21037'
const otherCrs = 'EPSG:' + 21036
const requestBody = {
  action: 'record_observation', definitionId: 'definition-1', label: 'DR-01', designRevision: 3,
  designEasting: 500000, designNorthing: 9860000, designRL: 100,
  observedEasting: 500000.00321, observedNorthing: 9860000.00432, observedRL: 100.0054,
  capturedCrs: crs, capturedAt: '2026-10-08T09:30:00.000+03:00',
}
function invoke(body: Record<string, unknown> = requestBody) {
  const context = { params: Promise.resolve({ id: 'project-1' }), userId: 'alice' }
  return POST(new NextRequest('http://localhost/api/project/project-1/setout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), context)
}
beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    let rows: Record<string, unknown>[] = []
    if (sql.includes('SELECT user_id FROM projects')) rows = [{ user_id: 'alice' }]
    else if (sql.includes('FROM project_reference_systems')) rows = [{ horizontal_crs: crs, datum_name: 'Arc 1960', hemisphere: 'S', distance_mode: 'grid', coordinate_precision: 3, vertical_datum: 'Site benchmark BM-01' }]
    else if (sql.includes('FROM projects')) rows = [{ datum: 'Arc 1960', utm_zone: 37, hemisphere: 'S' }]
    else if (sql.includes('FROM setout_points p')) rows = [{ id: 'point-1', easting: 500000, northing: 9860000, design_rl: 100, revision: 3, definition_crs: crs, tolerance_profile_id: null, definition_metadata: null,point_metadata:{projectCrs:crs,declaredHeightReference:'Site benchmark BM-01',setoutToleranceProfileSnapshot:null} }]
    else if (sql.includes('INSERT INTO setout_observations')) rows = [{ id: 'shot-1' }]
    return { rows, rowCount: rows.length } as Awaited<ReturnType<typeof db.query>>
  })
})
test('preserves original precision, device time, reference and recorded numerical assessment', async () => {
  expect((await invoke()).status).toBe(201)
  const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO setout_observations'))
  expect(insert?.[0]).toContain('capture_snapshot')
  const snapshot = JSON.parse(String(insert?.[1]?.[29])) as Record<string, unknown>
  expect(snapshot).toMatchObject({
    schemaVersion: 2, projectId: 'project-1', definitionId: 'definition-1', pointId: 'point-1', designRevision: 3,
    horizontalCrs: crs, verticalDatum: 'Site benchmark BM-01', capturedAt: '2026-10-08T06:30:00.000Z',
    observed: { easting: 500000.00321, northing: 9860000.00432, rl: 100.0054 },
    assessment: { result: 'INFO' },tolerance:{horizontalM:null,verticalM:null},
  })
})
test('rejects a capture reference different from the project before storing the observation', async () => {
  expect((await invoke({ ...requestBody, capturedCrs: otherCrs })).status).toBe(409)
  expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO setout_observations'))).toBe(false)
})

function savedCaptureFixture() {
  const snapshot = defined(parseSetoutCaptureSnapshot(archived))
  const existing = {
    id: 'accepted-shot', definition_id: 'definition-1', label: 'DR-01', design_revision: 3,
    design_easting: '500000.000', design_northing: '9860000.000', design_rl: '100.000',
    observed_easting: '500000.003', observed_northing: '9860000.004', observed_rl: '100.005', reported_accuracy_m: null,
    staked_by: 'alice', instrument: null, instrument_serial: null, operator_name: null, crew: null,
    observation_batch_id: null, notes: null, result: 'WARN', capture_snapshot: snapshot,
  }
  const originalQuery = query.getMockImplementation()
  query.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM setout_observations o')) return { rows: [existing], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [{ horizontal_crs: 'EPSG:3857', datum_name: 'WGS 84', distance_mode: 'grid', coordinate_precision: 3 }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }
    if (!originalQuery) throw new Error('Missing original query fixture')
    return originalQuery(sql, values)
  })
}
test('reconciles an accepted shot even after the current project declaration becomes invalid', async () => {
  savedCaptureFixture()
  const response = await invoke({ ...requestBody, clientShotId: 'device-1' })
  expect(response.status).toBe(200)
  const result: unknown = await response.json()
  expect(result).toMatchObject({ replayed: true, data: { id: 'accepted-shot' } })
  expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO setout_observations'))).toBe(false)
})
test('a sub-millimetre measurement change cannot reuse the accepted device shot ID', async () => {
  savedCaptureFixture()
  const response = await invoke({ ...requestBody, clientShotId: 'device-1', observedRL: requestBody.observedRL + 0.00001 })
  expect(response.status).toBe(409)
  const result: unknown = await response.json()
  expect(result).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
})
test.each(['2026-10-08', '2026-02-30T09:30:00Z', '2026-10-08T09:30:00'])('rejects ambiguous or invalid device time %s', async (capturedAt) => {
  expect((await invoke({ ...requestBody, capturedAt })).status).toBe(400)
})

test('keeps a shot retryable when the existing server still has a v1-only capture constraint',async()=>{
  const original=query.getMockImplementation()
  query.mockImplementation(async(sql:string,values?:unknown[])=>{
    if(sql.includes('INSERT INTO setout_observations'))throw Object.assign(new Error('synthetic old capture shape'),{code:'23514',constraint:'setout_capture_snapshot_shape'})
    if(!original)throw new Error('Missing database fixture')
    return original(sql,values)
  })
  const response=await invoke()
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({code:'SETOUT_CAPTURE_SCHEMA_NOT_READY'})
})

test('replay compares the original v2 uncertainty and reference binding after the context changes',async()=>{
  await invoke({...requestBody,accuracyM:0.001,verticalAccuracyM:0.002,capturedVerticalDatum:'Site benchmark BM-01',clientShotId:'device-v2'})
  const inserted=query.mock.calls.find(([sql])=>sql.includes('INSERT INTO setout_observations'))
  const snapshot:unknown=JSON.parse(String(inserted?.[1]?.[29]))
  const saved={id:'shot-v2',definition_id:'definition-1',label:'DR-01',design_revision:3,design_easting:500000,design_northing:9860000,design_rl:100,observed_easting:requestBody.observedEasting,observed_northing:requestBody.observedNorthing,observed_rl:requestBody.observedRL,reported_accuracy_m:0.001,staked_by:'alice',instrument:null,instrument_serial:null,operator_name:null,crew:null,observation_batch_id:null,notes:null,result:'INFO',capture_snapshot:snapshot}
  const original=query.getMockImplementation()
  query.mockImplementation(async(sql:string,values?:unknown[])=>{
    if(sql.includes('FROM setout_observations o'))return {rows:[saved],rowCount:1,command:'SELECT',oid:0,fields:[]}
    if(!original)throw new Error('Missing database fixture');return original(sql,values)
  })
  expect((await invoke({...requestBody,accuracyM:0.001,verticalAccuracyM:0.002,capturedVerticalDatum:'Site benchmark BM-01',clientShotId:'device-v2'})).status).toBe(200)
  expect((await invoke({...requestBody,accuracyM:0.001,verticalAccuracyM:0.003,capturedVerticalDatum:'Site benchmark BM-01',clientShotId:'device-v2'})).status).toBe(409)
})
