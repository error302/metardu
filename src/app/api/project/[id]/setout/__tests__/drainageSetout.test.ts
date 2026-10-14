/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import { db, setRlsContext } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { POST } from '@/app/api/project/[id]/setout/route'
import { SRID_21037, SRID_32737 } from '@/lib/map/projectionConstants'
import type { DrainageData } from '@/types/engineering'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) =>
    async (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, body: await req.json() }),
}))
jest.mock('@/lib/db', () => ({
  db: { query: jest.fn(), getClient: jest.fn() },
  setRlsContext: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: jest.fn() }))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/workspaces/stageReference', () => ({
  resolveStageReference: jest.fn(() => ({ code: SRID_21037,verticalDatum:'Synthetic BM' })),
}))

const mockDbQuery = db.query as jest.Mock
const mockGetClient = db.getClient as jest.Mock
const mockSetRlsContext = setRlsContext as jest.Mock
const mockOwnership = requireProjectOwnership as jest.Mock

const drainage = (setoutToleranceProfile?: Record<string, unknown>) => ({
  projectCrs: SRID_21037,
  minimumCoverM: 1.2,
  setoutIntervalM: 50,
  ...(setoutToleranceProfile ? { setoutToleranceProfile } : {}),
  manholes: [
    {
      id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000,
      coverLevel: 102, invertLevelOut: 100, pipeOutsideDiameterOut: 315,
    },
    {
      id: 'B', name: 'MH-B', chainage: 200, easting: 500100, northing: 9800000,
      coverLevel: 101, invertLevelIn: 99,
    },
  ],
})

const request = (body: Record<string, unknown> = { action: 'save_drainage_definition' }) => new NextRequest('http://localhost/api/project/project-1/setout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const invoke = (body?: Record<string, unknown>) => {
  const handler = POST as unknown as (
    req: NextRequest,
    context: { params: { id: string }; userId: string },
  ) => Promise<NextResponse>
  return handler(request(body), { params: { id: 'project-1' }, userId: 'alice' })
}

beforeEach(() => {
  mockDbQuery.mockReset()
  mockGetClient.mockReset()
  mockSetRlsContext.mockReset().mockResolvedValue(undefined)
  mockOwnership.mockReset().mockResolvedValue({ ok: true, projectUserId: 'alice' })
})

test('recomputes saved drainage data into a CRS-bound revisioned field set-out', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: drainage() } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })

  const clientQuery = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition-1' }] }
    if (sql.includes('COALESCE(MAX(revision)')) return { rows: [{ revision: 1 }] }
    return { rows: [] }
  })
  mockGetClient.mockResolvedValue({ query: clientQuery })

  const response = await invoke()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({
    data: { definitionId: 'definition-1', revision: 1, pointCount: 3, crs: SRID_21037 },
  })
  expect(mockDbQuery).toHaveBeenNthCalledWith(2, 'SELECT * FROM project_reference_systems WHERE project_id = $1', ['project-1'])
  expect(mockSetRlsContext).toHaveBeenCalledWith(expect.objectContaining({ query: clientQuery }))
  expect(mockSetRlsContext.mock.invocationCallOrder[0]).toBeGreaterThan(clientQuery.mock.invocationCallOrder[0])
  const queryCalls = clientQuery.mock.calls as Array<[string, unknown[]?]>
  const definitionInsert = queryCalls.find(([sql]) => sql.includes('INSERT INTO setout_definitions'))
  expect(definitionInsert?.[1]).toEqual(expect.arrayContaining(['project-1', SRID_21037]))
  const pointsInsert = queryCalls.find(([sql]) => sql.includes('INSERT INTO setout_points'))
  expect(pointsInsert?.[0]).toContain('$10::jsonb')
  expect(pointsInsert?.[1]).toHaveLength(26)
  expect(pointsInsert?.[1]?.[2]).toBe('DR-00001')
  const pointMetadata = JSON.parse(String(pointsInsert?.[1]?.[9])) as Record<string, unknown>
  expect(pointMetadata).toMatchObject({ pipeId: 'MH-A-MH-B', verticalTarget: 'Pipe invert RL', crownLevelM: null, coverAboveCrownM: null, coverAssessment: 'Not assessed: internal diameter unknown' })
  const definitionMetadata = JSON.parse(String(definitionInsert?.[1]?.[9])) as Record<string, unknown>
  expect(definitionMetadata).toMatchObject({
    generator: 'project-drainage-alignment-setout-v4',
    routedSegmentCount: 0,
    coordinateMethod: 'Straight segments between saved manhole coordinates; no interior alignment vertices were supplied.',
  })
  expect(clientQuery).toHaveBeenCalledWith('COMMIT')
})

test('the v4 server field job records the external crown from actual internal and outside dimensions', async () => {
  const source = drainage()
  const design = { ...source, manholes: source.manholes.map((manhole, index) => index === 0 ? { ...manhole, pipeDiameterOut: 300 } : manhole) }
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: design } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
  const query = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition-1' }] }
    if (sql.includes('COALESCE(MAX(revision)')) return { rows: [{ revision: 1 }] }
    return { rows: [] }
  })
  mockGetClient.mockResolvedValue({ query })
  expect((await invoke()).status).toBe(201)
  const calls = query.mock.calls as Array<[string, unknown[]?]>
  const points = calls.find(([sql]) => sql.includes('INSERT INTO setout_points'))
  const metadata = JSON.parse(String(points?.[1]?.[9])) as Record<string, unknown>
  expect(metadata.crownLevelM).toBeCloseTo(100.3075, 10)
  expect(metadata.coverAboveCrownM).toBeCloseTo(1.6925, 10)
})

test('persists routed-alignment provenance and stations a bent drainage run in the field job', async () => {
  const projectDrainage = drainage() as DrainageData
  projectDrainage.setoutIntervalM = 5
  projectDrainage.manholes[0].easting = 500000
  projectDrainage.manholes[0].northing = 9800000
  projectDrainage.manholes[0].alignmentVerticesOut = [{ easting: 500010, northing: 9800000 }]
  projectDrainage.manholes[0].alignmentSourceOut = {
    kind: 'saved_project_map_line',
    featureKey: 'map-line:storm-main:abc123',
    label: 'Storm main',
    sourceCrs: 'EPSG:4326',
    projectCrs: SRID_21037,
    orientation: 'reversed',
    startConnectorM: 0,
    endConnectorM: 0,
  }
  projectDrainage.manholes[0].chainage = 100
  projectDrainage.manholes[1].easting = 500010
  projectDrainage.manholes[1].northing = 9800010
  projectDrainage.manholes[1].chainage = 120
  projectDrainage.manholes[1].invertLevelIn = 99.8

  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: projectDrainage } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })

  let insertedPoints: unknown[] = []
  const clientQuery = jest.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition-bent' }] }
    if (sql.includes('INSERT INTO setout_points')) insertedPoints = values ?? []
    if (sql.includes('COALESCE(MAX(revision)')) return { rows: [{ revision: 1 }] }
    return { rows: [] }
  })
  mockGetClient.mockResolvedValue({ query: clientQuery })

  const response = await invoke()
  const calls = clientQuery.mock.calls as Array<[string, unknown[]?]>
  const definitionInsert = calls.find(([sql]) => sql.includes('INSERT INTO setout_definitions'))
  const metadata = JSON.parse(String(definitionInsert?.[1]?.[9])) as Record<string, unknown>

  expect(response.status).toBe(201)
  const body = await response.json() as { data: { definitionId: string; pointCount: number; coordinateWarnings: string[] } }
  expect(body).toMatchObject({ data: { definitionId: 'definition-bent', pointCount: 5 } })
  expect(metadata).toMatchObject({
    generator: 'project-drainage-alignment-setout-v4',
    routedSegmentCount: 1,
    mapAlignmentSegmentCount: 1,
  })
  const mapSources = metadata.mapAlignmentSources as Array<Record<string, unknown>>
  expect(mapSources[0]).toMatchObject({ from: 'MH-A', to: 'MH-B' })
  expect(mapSources[0].source).toMatchObject({
    kind: 'saved_project_map_line',
    featureKey: 'map-line:storm-main:abc123',
  })
  expect(metadata.coordinateMethod).toContain('unverified design geometry')
  expect(JSON.parse(String(insertedPoints[9]))).toMatchObject({
    alignmentSource: { kind: 'saved_project_map_line', featureKey: 'map-line:storm-main:abc123' },
  })
  expect(body.data.coordinateWarnings.join(' ')).toMatch(/not verified design or survey control/i)
  const bendStation = insertedPoints.slice(18, 26) as unknown[]
  expect(bendStation.slice(3, 6)).toEqual([500010, 9800000, 99.9])
  expect(JSON.parse(String(bendStation[7]))).toMatchObject({ pipeChainageM: 10, stationRole: 'Intermediate' })
})

test('rejects a drainage schedule whose CRS differs from the project declaration', async () => {
  const mismatched = drainage()
  mismatched.projectCrs = SRID_32737
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: mismatched } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })

  const response = await invoke()
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'DRAINAGE_CRS_MISMATCH' })
  expect(mockGetClient).not.toHaveBeenCalled()
})

test('stores a validated project tolerance profile with the drainage definition snapshot', async () => {
  const profile = {
    name: 'North Trunk Installation',
    jurisdiction: 'Contract C-17',
    version: 'Rev 2',
    horizontalMm: '5',
    verticalMm: '2',
    effectiveDate: '2026-10-01',
    source: 'Contract C-17 section 12.3',
    approvedBy: 'Project Survey Engineer',
    acknowledged: true,
  }
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: drainage(profile) } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })

  const clientQuery = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('INSERT INTO tolerance_profiles')) return { rows: [{ id: 'profile-1' }] }
    if (sql.includes('INSERT INTO setout_definitions')) return { rows: [{ id: 'definition-1' }] }
    if (sql.includes('COALESCE(MAX(revision)')) return { rows: [{ revision: 1 }] }
    return { rows: [] }
  })
  mockGetClient.mockResolvedValue({ query: clientQuery })

  const response = await invoke()
  const calls = clientQuery.mock.calls as Array<[string, unknown[]?]>
  const profileInsert = calls.find(([sql]) => sql.includes('INSERT INTO tolerance_profiles'))
  const definitionInsert = calls.find(([sql]) => sql.includes('INSERT INTO setout_definitions'))
  const definitionMetadata = JSON.parse(String(definitionInsert?.[1]?.[9])) as Record<string, unknown>

  expect(response.status).toBe(201)
  expect(profileInsert?.[1]).toEqual(expect.arrayContaining(['North Trunk Installation', 'Contract C-17', 'Rev 2']))
  expect(definitionInsert?.[0]).toContain('tolerance_profile_id')
  expect(definitionInsert?.[1]?.[7]).toBe('profile-1')
  expect(definitionMetadata).toMatchObject({
    setoutToleranceSource: 'project_approved_profile',
    setoutToleranceProfileSnapshot: {
      id: 'profile-1',
      name: 'North Trunk Installation',
      rules: { setout: { horizontalM: 0.005, verticalM: 0.002, unit: 'm' } },
    },
  })
})

test('rejects an incomplete project tolerance profile before creating field targets', async () => {
  const profile = {
    name: 'North Trunk Installation',
    jurisdiction: 'Contract C-17',
    version: 'Rev 2',
    horizontalMm: '5',
    verticalMm: '2',
    effectiveDate: '2026-10-01',
    source: 'Contract C-17 section 12.3',
    approvedBy: 'Project Survey Engineer',
    acknowledged: false,
  }
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: { drainage: drainage(profile) } }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })

  const response = await invoke()
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ code: 'SETOUT_TOLERANCE_PROFILE_INVALID' })
  expect(mockGetClient).not.toHaveBeenCalled()
})

test('rejects a queued field shot captured against an older design revision', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9800000, design_rl: 100, revision: 2 }] })

  const response = await invoke({
    action: 'record_observation',
    definitionId: 'definition-1',
    label: 'DR-00001',
    designRevision: 1,
    designEasting: 500000,
    designNorthing: 9800000,
    designRL: 100,
    observedEasting: 500000,
    observedNorthing: 9800000,
    observedRL: 100,
  })

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'SETOUT_REVISION_CHANGED' })
  expect(mockDbQuery).toHaveBeenCalledTimes(3)
})

test('records a horizontal-only shot to a 3D target as INFO, never as a false pass', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9800000, design_rl: 100, revision: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'shot-1' }] })

  const response = await invoke({
    action: 'record_observation',
    definitionId: 'definition-1',
    label: 'DR-00001',
    designRevision: 1,
    designEasting: 500000,
    designNorthing: 9800000,
    designRL: 100,
    observedEasting: 500000,
    observedNorthing: 9800000,
  })

  const body = await response.json() as { data: { result: string; message: string } }
  const calls = mockDbQuery.mock.calls as Array<[string, unknown[]?]>
  const observationInsert = calls[3]?.[1]
  const observationSql = calls[3]?.[0] ?? ''
  expect(response.status).toBe(201)
  expect(body.data.result).toBe('INFO')
  expect(body.data.message).toMatch(/observed RL is required/i)
  expect(observationSql).toContain('reported_accuracy_m')
  expect(observationInsert?.[9]).toBeNull()
  expect(observationInsert?.[15]).toBeNull()
  expect(observationInsert?.[18]).toBeNull()
  expect(observationInsert?.[19]).toBeNull()
})

test('persists the reported fix accuracy without inventing adopted project criteria', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9800000, design_rl: null, revision: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'shot-1' }] })

  const response = await invoke({
    action: 'record_observation',
    definitionId: 'definition-1',
    label: 'DR-00001',
    designRevision: 1,
    designEasting: 500000,
    designNorthing: 9800000,
    designRL: null,
    observedEasting: 500000.002,
    observedNorthing: 9800000.001,
    accuracyM: 0.005,
  })

  const body = await response.json() as { data: { result: string } }
  const calls = mockDbQuery.mock.calls as Array<[string, unknown[]?]>
  const observationSql = calls[3]?.[0] ?? ''
  const observationValues = calls[3]?.[1]
  expect(response.status).toBe(201)
  expect(body.data.result).toBe('INFO')
  expect(observationSql).toContain('reported_accuracy_m')
  expect(observationValues?.[15]).toBe(0.005)
})

test('judges and records drainage field shots against the saved project profile', async () => {
  const snapshot = {
    id: 'profile-1',
    name: 'North Trunk Installation',
    jurisdiction: 'Contract C-17',
    version: 'Rev 2',
    rules: {
      schemaVersion: 1,
      setout: { horizontalM: 0.005, verticalM: 0.002, unit: 'm' },
      effectiveDate: '2026-10-01',
      source: 'Contract C-17 section 12.3',
      approvedBy: 'Project Survey Engineer',
      transcribedBy: 'alice',
      transcribedAt: '2026-10-07T08:30:00.000Z',
      acknowledged: true,
    },
  }
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'point-1', easting: 500000, northing: 9800000, design_rl: 100, revision: 1,
      tolerance_profile_id: 'profile-1', definition_metadata: { setoutToleranceProfileSnapshot: snapshot },
      definition_crs:SRID_21037,point_metadata:{projectCrs:SRID_21037,declaredHeightReference:'Synthetic BM',setoutToleranceProfileSnapshot:snapshot},
    }] })
    .mockResolvedValueOnce({ rows: [{ id: 'shot-1' }] })

  const response = await invoke({
    action: 'record_observation',
    definitionId: 'definition-1',
    label: 'DR-00001',
    designRevision: 1,
    designEasting: 500000,
    designNorthing: 9800000,
    designRL: 100,
    observedEasting: 500000.02,
    observedNorthing: 9800000,
    observedRL: 100.01,
    accuracyM: 0.005,
    verticalAccuracyM:0.001,capturedCrs:SRID_21037,capturedVerticalDatum:'Synthetic BM',capturedToleranceProfileId:'profile-1',capturedAt:'2026-10-14T06:00:00Z',
  })
  const body = await response.json() as { data: { result: string; toleranceProfileId: string; tolerance: { horizontalM: number; verticalM: number } } }
  const calls = mockDbQuery.mock.calls as Array<[string, unknown[]?]>
  const observationValues = calls[3]?.[1]

  expect(response.status).toBe(201)
  expect(body.data).toMatchObject({
    result: 'FAIL',
    toleranceProfileId: 'profile-1',
    tolerance: { horizontalM: 0.005, verticalM: 0.002 },
  })
  expect(observationValues?.[16]).toBe('profile-1')
  expect(observationValues?.[17]).toBe('Rev 2')
  expect(observationValues?.[18]).toBe(0.005)
  expect(observationValues?.[19]).toBe(0.002)
  expect(observationValues?.[20]).toBe('FAIL')
})

const queuedShot = (overrides: Record<string, unknown> = {}) => ({
  action: 'record_observation',
  clientShotId: 'shot_local_123',
  definitionId: 'definition-1',
  label: 'DR-00001',
  designRevision: 1,
  designEasting: 500000,
  designNorthing: 9800000,
  designRL: 100,
  observedEasting: 500000.002,
  observedNorthing: 9800000.001,
  observedRL: 100.001,
  accuracyM: 0.005,
  notes: 'Field shot captured 2026-10-07T08:30:00.000Z (PASS)',
  ...overrides,
})

const storedQueuedShot = (overrides: Record<string, unknown> = {}) => ({
  id: 'shot-server-1',
  definition_id: 'definition-1',
  label: 'DR-00001',
  design_easting: 500000,
  design_northing: 9800000,
  design_rl: 100,
  observed_easting: 500000.002,
  observed_northing: 9800000.001,
  observed_rl: 100.001,
  reported_accuracy_m: 0.005,
  design_revision: 1,
  staked_by: 'alice',
  instrument: null,
  instrument_serial: null,
  operator_name: null,
  crew: null,
  observation_batch_id: null,
  notes: 'Field shot captured 2026-10-07T08:30:00.000Z (PASS)',
  result: 'PASS',
  ...overrides,
})

test('replaying the same queued shot returns its existing immutable observation', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [storedQueuedShot()] })

  const response = await invoke(queuedShot())
  const body = await response.json() as { replayed: boolean; data: { id: string; result: string; designRevision: number } }

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ replayed: true, data: { id: 'shot-server-1', result: 'PASS', designRevision: 1 } })
  expect(mockDbQuery).toHaveBeenCalledTimes(3)
  const calls = mockDbQuery.mock.calls as unknown as Array<[string, ...unknown[]]>
  expect(calls[2]?.[0]).toContain('o.client_shot_id = $2')
})

test('rejects reuse of a queued shot identifier for different measured coordinates', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [storedQueuedShot()] })

  const response = await invoke(queuedShot({ observedEasting: 500000.1 }))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  expect(mockDbQuery).toHaveBeenCalledTimes(3)
})

test('inserts a queued shot with its stable client identifier and safe conflict handling', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9800000, design_rl: 100, revision: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'shot-server-1' }] })

  const response = await invoke(queuedShot())
  const insertCall = mockDbQuery.mock.calls[4] as [string, unknown[]]

  expect(response.status).toBe(201)
  expect(insertCall[0]).toContain('client_shot_id')
  expect(insertCall[0]).toContain('ON CONFLICT (project_id, client_shot_id)')
  expect(insertCall[1][28]).toBe('shot_local_123')
})

test('returns the first server record when two offline retries race to insert', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ utm_zone: 37, hemisphere: 'S', datum: 'Arc 1960', engineering_data: {} }] })
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-1', horizontal_crs: SRID_21037 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'point-1', easting: 500000, northing: 9800000, design_rl: 100, revision: 1 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [storedQueuedShot()] })

  const response = await invoke(queuedShot())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ replayed: true, data: { id: 'shot-server-1' } })
  expect(mockDbQuery).toHaveBeenCalledTimes(6)
})
