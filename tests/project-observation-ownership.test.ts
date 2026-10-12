/** @jest-environment node */
import { db } from '@/lib/db'
import {
  createObservationBatch,
  getEvidenceTimeline,
  listObservationBatches,
} from '@/lib/observations/observationBatches'
import { GET as GET_BATCHES, POST as POST_BATCH } from '@/app/api/project/[id]/batches/route'
import { GET as GET_EVIDENCE } from '@/app/api/project/[id]/evidence/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
  apiSuccess: (data: unknown, status = 200) =>
    require('next/server').NextResponse.json(data, { status }),
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/observations/observationBatches', () => ({
  createObservationBatch: jest.fn(),
  getEvidenceTimeline: jest.fn(),
  listObservationBatches: jest.fn(),
}))

const mockDb = db.query as jest.Mock
const context = () => ({
  userId: 'alice',
  params: { id: 'project-1' },
  body: { batchNumber: 'B-1', sourceType: 'import', sourceFileContent: 'raw file' },
})
const methods = [
  ['GET batches', GET_BATCHES],
  ['POST batch', POST_BATCH],
  ['GET evidence', GET_EVIDENCE],
] as const

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.mockReset()
})

test.each(methods)('%s rejects another project owner before accessing evidence', async (_name, handler) => {
  mockDb.mockResolvedValue({ rows: [{ user_id: 'bob' }] })

  const response = await handler({} as any, context() as any)

  expect(response.status).toBe(403)
  expect(mockDb).toHaveBeenCalledWith(
    'SELECT user_id FROM projects WHERE id = $1',
    ['project-1'],
  )
  expect(listObservationBatches).not.toHaveBeenCalled()
  expect(createObservationBatch).not.toHaveBeenCalled()
  expect(getEvidenceTimeline).not.toHaveBeenCalled()
})

test.each(methods)('%s denies unowned legacy projects', async (_name, handler) => {
  mockDb.mockResolvedValue({ rows: [{ user_id: null }] })

  const response = await handler({} as any, context() as any)

  expect(response.status).toBe(403)
  expect(listObservationBatches).not.toHaveBeenCalled()
  expect(createObservationBatch).not.toHaveBeenCalled()
  expect(getEvidenceTimeline).not.toHaveBeenCalled()
})

test.each(methods)('%s returns 404 for a missing project', async (_name, handler) => {
  mockDb.mockResolvedValue({ rows: [] })

  const response = await handler({} as any, context() as any)

  expect(response.status).toBe(404)
  expect(listObservationBatches).not.toHaveBeenCalled()
  expect(createObservationBatch).not.toHaveBeenCalled()
  expect(getEvidenceTimeline).not.toHaveBeenCalled()
})

test('the owner can list batches and evidence and create a batch under their identity', async () => {
  mockDb.mockResolvedValue({ rows: [{ user_id: 'alice' }] })
  ;(listObservationBatches as jest.Mock).mockResolvedValue([{ id: 'batch-1' }])
  ;(getEvidenceTimeline as jest.Mock).mockResolvedValue([{ id: 'event-1' }])
  ;(createObservationBatch as jest.Mock).mockResolvedValue({ id: 'batch-2' })

  const batches = await GET_BATCHES({} as any, context() as any)
  const evidence = await GET_EVIDENCE({} as any, context() as any)
  const created = await POST_BATCH({} as any, context() as any)

  expect(batches.status).toBe(200)
  expect((await batches.json()).batches).toEqual([{ id: 'batch-1' }])
  expect(evidence.status).toBe(200)
  expect((await evidence.json()).events).toEqual([{ id: 'event-1' }])
  expect(created.status).toBe(201)
  expect(createObservationBatch).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      batchNumber: 'B-1',
      sourceFileContent: 'raw file',
      userId: 'alice',
    }),
  )
})