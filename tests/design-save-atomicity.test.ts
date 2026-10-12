/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
const declaredWgs84Crs = 'EPSG:' + (32700 + 36)

const mockQuery = jest.fn<Promise<{ rows: unknown[]; rowCount?: number }>, [string, ...unknown[]]>()
const mockClient = { query: mockQuery }
const mockTransaction = jest.fn<Promise<unknown>, [(client: typeof mockClient) => Promise<unknown>]>()
const mockRevision = jest.fn<Promise<unknown>, unknown[]>()
const mockComputation = jest.fn<Promise<unknown>, unknown[]>()
const mockQa = jest.fn<Promise<unknown>, unknown[]>()
let saved = false

jest.mock('@/lib/db', () => ({
  db: { query: (...args: [string, ...unknown[]]) => mockQuery(...args),
    transaction: (work: (client: typeof mockClient) => Promise<unknown>) => mockTransaction(work) },
  setCurrentUserId: jest.fn(),
}))
jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>) =>
    async (req: NextRequest, ctx: unknown) => {
      try {
        const body: unknown = await req.json()
        return await handler(req, { ...(ctx as object), body, userId: 'user-1' })
      }
      catch { return NextResponse.json({ error: 'Save failed' }, { status: 500 }) }
    },
}))
jest.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'user-1' } }) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/projectAccess', () => ({ checkProjectAccess: async () => ({ allowed: true, isOwner: true }) }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: async () => ({ ok: true }) }))
jest.mock('@/lib/engineering/designRevisions', () => ({
  currentDesignRevision: async () => ({ revision: 'R03' }),
  recordDesignRevision: (...args: unknown[]) => mockRevision(...args),
}))
jest.mock('@/lib/provenance/computationAndQa', () => ({
  recordComputationRun: (...args: unknown[]) => mockComputation(...args),
  recordQaRun: (...args: unknown[]) => mockQa(...args),
}))
jest.mock('@/lib/observations/observationBatches', () => ({ recordEvidenceEvent: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/deliverables/deliverableRegister', () => ({ hashDeliverableContent: () => 'hash' }))
jest.mock('@/lib/submission/pre-submit-check', () => ({
  preSubmitCheck: () => ({ ready: false, score: 40, blockers: 2, warnings: 0, summary: 'Draft', categories: [] }),
}))
jest.mock('@/lib/survey/field-to-finish', () => ({
  fieldToFinish: async () => ({
    status: 'warning', adjustedPoints: [{ name: 'A', easting: 500000, northing: 9860000 }],
    instantFeedback: { precisionFormatted: '1:1000', precisionRatio: 1000, linearMisclosure: 0.1, closingErrorE: 0.1, closingErrorN: 0, perimeter: 100, passes: false },
    area: { squareMetres: 1000, hectares: 0.1 }, closureCheck: { perimeter: 100 },
  }),
}))

import { POST as alignmentPost } from '@/app/api/engineering/alignment/route'
import { POST as pipelinePost } from '@/app/api/project/[id]/field-to-finish/route'

beforeEach(() => {
  jest.clearAllMocks()
  saved = false
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('UPDATE projects') || sql.includes('INSERT INTO road_alignments')) {
      saved = true
      return { rows: [{ id: 'alignment-1', project_id: 'project-1' }], rowCount: 1 }
    }
    if (sql.includes('FROM survey_points')) return { rows: [{ name: 'A', easting: 500000, northing: 9860000 }] }
    if (sql.includes('FROM field_book_entries')) return { rows: [] }
    if (sql.includes('FROM project_reference_systems')) return { rows: [] }
    return { rows: [{ id: 'project-1', revision: '2026-10-08', datum: 'Arc1960', utm_zone: 37, hemisphere: 'S', survey_type: 'cadastral' }] }
  })
  mockTransaction.mockImplementation(async (work: (client: typeof mockClient) => Promise<unknown>) => {
    const before = saved
    try { return await work(mockClient) }
    catch (error) { saved = before; throw error }
  })
  mockRevision.mockResolvedValue({ revision: { id: 'revision-4', revision: 'R04' } })
  mockComputation.mockResolvedValue({ id: 'computation-1' })
  mockQa.mockResolvedValue({ runId: 'qa-1' })
})

function alignmentRequest() {
  return alignmentPost(new NextRequest('http://localhost/api/engineering/alignment', { method: 'POST',
    body: JSON.stringify({ project_id: 'project-1', road_name: 'Road A', datum: 'Arc1960', coordinate_system: 'UTM' }),
  }), { params: {} })
}
function pipelineRequest() {
  return pipelinePost(new NextRequest('http://localhost/api/project/project-1/field-to-finish', { method: 'POST' }),
    { params: Promise.resolve({ id: 'project-1' }) })
}

test('alignment history failure rejects the save and rolls back the alignment', async () => {
  mockRevision.mockRejectedValue(new Error('Revision unavailable'))
  expect((await alignmentRequest()).status).toBe(500)
  expect(saved).toBe(false)
})
test('alignment save and revision use one transaction client', async () => {
  expect((await alignmentRequest()).status).toBe(200)
  expect(mockTransaction).toHaveBeenCalledTimes(1)
  expect(mockRevision.mock.calls[0][1]).toBe(mockClient)
})
test.each(['revision', 'computation', 'QA'])('pipeline %s failure cannot confirm partially saved results', async (failure) => {
  const operation = failure === 'revision' ? mockRevision : failure === 'computation' ? mockComputation : mockQa
  operation.mockRejectedValue(new Error(`${failure} unavailable`))
  expect((await pipelineRequest()).status).toBe(500)
  expect(saved).toBe(false)
})
test('pipeline persists results and all mandatory provenance on one transaction client', async () => {
  expect((await pipelineRequest()).status).toBe(200)
  expect(mockTransaction).toHaveBeenCalledTimes(1)
  expect(mockRevision.mock.calls[0][1]).toBe(mockClient)
  expect(mockComputation.mock.calls[0][1]).toBe(mockClient)
  expect(mockQa.mock.calls[0][1]).toBe(mockClient)
  expect(mockComputation.mock.calls[0][0]).toEqual(expect.objectContaining({ inputVersion: 'R03' }))
  expect(mockQa.mock.calls[0][0]).toEqual(expect.objectContaining({ designRevision: 'R04' }))
  expect(mockQa.mock.calls[0][0]).toHaveProperty('toleranceProfile', null)
  expect(mockQa.mock.calls[0][0]).toHaveProperty('results.0.checkType', 'traverse.linear_misclosure')
  expect(mockQa.mock.calls[0][0]).toHaveProperty('results.0.result', 'INFO')
  expect(mockQa.mock.calls[0][0]).toHaveProperty('results.0.thresholdValue', null)
})

function useStoredReference(reference: Record<string, unknown>) {
  const query = mockQuery.getMockImplementation()
  mockQuery.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes('FROM project_reference_systems')) return { rows: [reference] }
    if (!query) throw new Error('Missing query fixture')
    return query(sql, ...args)
  })
}

test.each(['alignment', 'pipeline'])('%s uses the declared CRS over conflicting legacy metadata', async (route) => {
  useStoredReference({ horizontal_crs: declaredWgs84Crs, datum_name: 'WGS 84', hemisphere: 'S', distance_mode: 'grid', coordinate_precision: 3 })
  expect((await (route === 'alignment' ? alignmentRequest() : pipelineRequest())).status).toBe(200)
  expect(mockRevision.mock.calls[0][0]).toEqual(expect.objectContaining({ crs: declaredWgs84Crs }))
})
test.each(['alignment', 'pipeline'])('%s blocks an invalid declared reference before saving', async (route) => {
  useStoredReference({ horizontal_crs: 'EPSG:3857', datum_name: 'WGS 84', distance_mode: 'grid', coordinate_precision: 3 })
  expect((await (route === 'alignment' ? alignmentRequest() : pipelineRequest())).status).toBeGreaterThanOrEqual(400)
  expect(saved).toBe(false)
  expect(mockRevision).not.toHaveBeenCalled()
})

test('a filtered or conflicting project update cannot create a success revision', async () => {
  const previousQuery = mockQuery.getMockImplementation()
  mockQuery.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes('UPDATE projects')) return { rows: [], rowCount: 0 }
    if (!previousQuery) throw new Error('Missing query fixture')
    return previousQuery(sql, ...args)
  })
  expect((await pipelineRequest()).status).toBe(500)
  expect(saved).toBe(false)
  expect(mockRevision).not.toHaveBeenCalled()
})
