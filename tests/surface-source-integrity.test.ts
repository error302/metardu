/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/project/[id]/surfaces/route'
import { db } from '@/lib/db'
import { toReferenceSystemRow, buildProjectReferenceSystem } from '@/lib/spatial/projectReferenceSystem'
import { pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { createHash } from 'node:crypto'
import { hashSurfaceValue } from '@/lib/topo/surfaceRevision'
import { surfaceReviewValue } from '@/lib/topo/surfaceRequest'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (options: { schema?: { parse: (value: unknown) => unknown } }, handler: (req: NextRequest, context: Record<string, unknown>) => Promise<Response>) => async (req: NextRequest, context: Record<string, unknown>) => handler(req, { ...context, userId: '11111111-1111-4111-8111-111111111111', body: options.schema?.parse(await req.json()) }) }))
jest.mock('@/lib/db', () => ({ db: { transaction: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn(async () => ({ ok: true })), requireProjectReadAccess: jest.fn(async () => ({ ok: true })) }))
const OWNER = '11111111-1111-4111-8111-111111111111', PROJECT = '22222222-2222-4222-8222-222222222222'
const CRS = 'EPSG:21037'
const OTHER_CRS = 'EPSG:32632'
const reference = toReferenceSystemRow(PROJECT, { prs: buildProjectReferenceSystem({ datum: 'ARC1960', utmZone: 37, hemisphere: 'S', verticalDatum: 'Synthetic BM', verticalReference: 'local', distanceMode: 'grid', coordinatePrecision: 3 }) }, OWNER)
const base = { horizontal_crs: CRS, vertical_datum: 'Synthetic BM', deleted_at: null }
const observations = [
  { ...base, id: '33333333-3333-4333-8333-333333333331', point_name: 'A', easting: 500000, northing: 9850000, elevation: -2 },
  { ...base, id: '33333333-3333-4333-8333-333333333332', point_name: 'B', easting: 500020, northing: 9850000, elevation: 0 },
  { ...base, id: '33333333-3333-4333-8333-333333333333', point_name: 'C', easting: 500000, northing: 9850020, elevation: 0 },
]
let rows: Record<string, unknown>[]
let declared: Record<string, unknown>
let storedLines: Record<string, unknown>[]
const query = jest.fn<Promise<{ rows: Record<string, unknown>[]; rowCount: number }>, [string, unknown[]?]>()
beforeEach(() => {
  rows = observations.map(point => ({ ...point }))
  declared = { ...reference }
  storedLines = []
  query.mockReset().mockImplementation(async (sql: string, values?: unknown[]) => {
    let result: Record<string, unknown>[] = []
    if (sql.includes('FROM projects')) result = [{ id: PROJECT, user_id: OWNER }]
    else if (sql.includes('FROM project_reference_systems')) result = [declared]
    else if (sql.includes('FROM survey_points')) result = rows.filter(point => (!/elevation IS NOT NULL/.test(sql) || point.elevation !== null) && (!/deleted_at IS NULL/.test(sql) || point.deleted_at === null) && (!/ANY\(\$2/.test(sql) || (values?.[1] as string[]).includes(point.id as string)))
    else if (sql.includes('FROM breaklines')) result = storedLines
    else if (/INSERT INTO surfaces\(/.test(sql)) result = [{ id: '44444444-4444-4444-8444-444444444444' }]
    else if (/INSERT INTO surface_revisions/.test(sql)) result = [{ id: '55555555-5555-4555-8555-555555555555' }]
    else if (/INSERT INTO contour_sets/.test(sql)) result = [{ id: '66666666-6666-4666-8666-666666666666', surface_id: values?.[0], surface_revision_id: values?.[1] }]
    else if (/^UPDATE surfaces/.test(sql.trim())) result = [{ id: values?.[0], current_revision_id: values?.[1] }]
    return { rows: result, rowCount: result.length || (/^\s*(INSERT|UPDATE)\b/.test(sql) ? 1 : 0) }
  })
  jest.mocked(db.transaction).mockImplementation(async handler => handler({ query } as never))
})
const compute = (body: Record<string, unknown> = {}) => {
  const pointIds = (body.pointIds as string[] | undefined) ?? rows.filter(point => point.deleted_at === null).map(point => point.id as string)
  const expectedSourceHash = hashSurfaceValue(surfaceReviewValue(pointImportReferenceHash(declared), rows.filter(point => pointIds.includes(point.id as string)).map(point => ({ id: point.id as string, pointName: point.point_name as string,
    x: point.easting as number, y: point.northing as number, z: point.elevation as number, code: point.code as string | null, horizontalCrs: point.horizontal_crs as string, verticalDatum: point.vertical_datum as string }))))
  return POST(new NextRequest(`http://localhost/api/project/${PROJECT}/surfaces`, { method: 'POST', body: JSON.stringify({ requestId: '77777777-7777-4777-8777-777777777777', expectedUserId: OWNER,
    pointIds, expectedReferenceHash: pointImportReferenceHash(declared), expectedSourceHash, interval: 1, resolution: 1, useStoredBreaklines: false, ...body }) }), { params: { id: PROJECT } })
}
const writes = () => query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))
test('complete compatible observations retain measured zero and negative levels', async () => {
  const response = await compute()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ data: { pointCount: 3 } })
})
test('the source hash can be verified after JSONB changes object-key ordering', async () => {
  expect((await compute()).status).toBe(201)
  const revision = query.mock.calls.find(([sql]) => /INSERT INTO surface_revisions/.test(sql))
  const result = JSON.parse(revision?.[1]?.[8] as string) as { snapshot: unknown }
  const hashAfterStorage = createHash('sha256').update(canonicalJson(result.snapshot)).digest('hex')
  expect(revision?.[1]?.[7]).toBe(hashAfterStorage)
})
test('an active observation with missing height blocks computation instead of being silently omitted', async () => {
  rows.push({ ...observations[0], id: '33333333-3333-4333-8333-333333333334', point_name: 'Unknown', easting: 500020, northing: 9850020, elevation: null })
  const response = await compute()
  expect(response.status).toBe(400)
  expect(writes()).toHaveLength(0)
})
test.each([
  ['missing source CRS', { horizontal_crs: null }], ['different source CRS', { horizontal_crs: OTHER_CRS }],
  ['missing height reference', { vertical_datum: null }], ['different height reference', { vertical_datum: 'Other BM' }],
])('refuses %s before creating an immutable revision', async (_label, change) => {
  rows[1] = { ...rows[1], ...change }
  const response = await compute()
  expect(response.status).toBe(400)
  expect(writes()).toHaveLength(0)
})
test('refuses an undeclared project height reference', async () => {
  declared.vertical_datum = null
  const response = await compute()
  expect(response.status).toBe(400)
  expect(writes()).toHaveLength(0)
})
test('soft-deleted observations do not silently re-enter a new surface', async () => {
  rows.push({ ...observations[0], id: '33333333-3333-4333-8333-333333333334', point_name: 'Deleted', easting: 500020, northing: 9850020, elevation: 2, deleted_at: '2026-10-23T00:00:00Z' })
  const response = await compute()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ data: { pointCount: 3 } })
})

test('an explicit selection is retained without silently filtering the active project source', async () => {
  rows.push({ ...observations[0], id: '33333333-3333-4333-8333-333333333334', elevation: null })
  const response = await compute({ pointIds: observations.map(point => point.id), expectedReferenceHash: pointImportReferenceHash(declared) })
  expect(response.status).toBe(201)
  const revision = query.mock.calls.find(([sql]) => /INSERT INTO surface_revisions/.test(sql))
  const result = JSON.parse(revision?.[1]?.[8] as string) as { snapshot: { schemaVersion: number; sourceSelection: { mode: string; pointIds: string[] }; observations: Array<{ horizontalCrs: string; verticalDatum: string; z: number }>; fieldVerified: boolean } }
  expect(result.snapshot.schemaVersion).toBe(2)
  expect(result.snapshot.sourceSelection).toEqual({ mode: 'explicit_point_ids', pointIds: observations.map(point => point.id) })
  expect(result.snapshot.observations.map(point => point.z)).toEqual([-2, 0, 0])
  expect(result.snapshot.observations.every(point => point.horizontalCrs === CRS && point.verticalDatum === 'Synthetic BM')).toBe(true)
  expect(result.snapshot.fieldVerified).toBe(false)
})
test('an unavailable selected identity cannot be substituted', async () => {
  const response = await compute({ pointIds: [observations[0].id, observations[1].id, '66666666-6666-4666-8666-666666666666'] })
  expect(response.status).toBe(409)
  expect(writes()).toHaveLength(0)
})
test('a stale reference review cannot create a surface', async () => {
  const response = await compute({ expectedReferenceHash: 'f'.repeat(64) })
  expect(response.status).toBe(409)
  expect(writes()).toHaveLength(0)
})
test('stored breaklines with unknown original references refuse automatic reuse', async () => {
  storedLines = [{ name: 'Original', breakline_type: 'hard', coordinates: observations.map(point => ({ x: point.easting, y: point.northing, z: point.elevation })) }]
  const response = await compute({ useStoredBreaklines: true })
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'BREAKLINE_REFERENCE_UNDECLARED' })
  expect(writes()).toHaveLength(0)
})
test('explicit compatible breaklines are retained in the revision without replacing original line records', async () => {
  const response = await compute({ breaklines: [{ name: 'Reviewed input', type: 'hard', points: [observations[0], observations[2]].map(point => ({ x: point.easting, y: point.northing, z: point.elevation })) }],
    expectedReferenceHash: pointImportReferenceHash(declared), breaklineReference: { horizontalCrs: CRS, verticalDatum: 'Synthetic BM', units: 'metres' } })
  expect(response.status).toBe(201)
  expect(query.mock.calls.some(([sql]) => /DELETE FROM breaklines|INSERT INTO breaklines/.test(sql))).toBe(false)
})
test('explicit breaklines do not borrow a reference from the current project by default', async () => {
  const response = await compute({ breaklines: [{ points: [observations[0], observations[2]].map(point => ({ x: point.easting, y: point.northing, z: point.elevation })) }] })
  expect(response.status).toBe(400)
  expect(writes()).toHaveLength(0)
})
