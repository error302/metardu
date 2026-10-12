/** @jest-environment node */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { POST as enqueueRoute } from '@/app/api/workers/job/route'
import { POST as processRoute } from '@/app/api/workers/process/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
  apiSuccess: (data: unknown) => ({ status: 200, json: async () => data }),
}))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))

const mockQuery = db.query as jest.Mock
const originalAdminKey = process.env.API_ADMIN_KEY
const enqueueRequest = () => new NextRequest('http://localhost/api/workers/job', { method: 'POST' })
const enqueueContext = (body: unknown) => ({ body, userId: 'surveyor-1' }) as unknown as Parameters<typeof enqueueRoute>[1]
const workerRequest = (authorization?: string) => new NextRequest('http://localhost/api/workers/process', {
  method: 'POST',
  headers: authorization ? { authorization } : {},
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.API_ADMIN_KEY = 'test-admin-key'
})

afterAll(() => {
  if (originalAdminKey === undefined) delete process.env.API_ADMIN_KEY
  else process.env.API_ADMIN_KEY = originalAdminKey
})

test.each(['report_processing', 'large_import', 'topology_full_project', 'bulk_plan_generation'])(
  'POST /api/workers/job refuses unimplemented %s before writing to the queue',
  async (jobType) => {
    const response = await enqueueRoute(enqueueRequest(), enqueueContext({ jobType, projectId: 'project-1', payload: {} }))

    expect(response.status).toBe(422)
    const result = await response.json() as { error: string }
    expect(result.error).toMatch(/no worker handler/)
    expect(mockQuery).not.toHaveBeenCalled()
  },
)

test.each([
  { label: 'top-level projectId', body: { jobType: 'pdf_generation', projectId: 'project-1', payload: {} } },
  { label: 'payload project_id', body: { jobType: 'pdf_generation', payload: { project_id: 'project-1' } } },
])('POST /api/workers/job rejects another owner through $label', async ({ body }) => {
  mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'someone-else' }] })

  const response = await enqueueRoute(enqueueRequest(), enqueueContext(body))

  expect(response.status).toBe(403)
  expect(mockQuery).toHaveBeenCalledTimes(1)
  expect((mockQuery.mock.calls[0] as [string, unknown[]])[0]).toMatch(/SELECT user_id FROM projects/)
})

test('POST /api/workers/job rejects conflicting project IDs before querying', async () => {
  const response = await enqueueRoute(enqueueRequest(), enqueueContext({
    jobType: 'pdf_generation',
    projectId: 'project-1',
    payload: { project_id: 'project-2' },
  }))

  expect(response.status).toBe(400)
  expect(mockQuery).not.toHaveBeenCalled()
})

test('POST /api/workers/job enqueues an owner project with the checked ID', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ user_id: 'surveyor-1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'pending' }] })

  const response = await enqueueRoute(enqueueRequest(), enqueueContext({
    jobType: 'pdf_generation',
    projectId: 'project-1',
    payload: { document_id: 'document-1' },
  }))

  expect(response.status).toBe(200)
  expect(mockQuery).toHaveBeenCalledTimes(2)
  const insertParams = (mockQuery.mock.calls[1] as [string, unknown[]])[1]
  const payload = JSON.parse(String(insertParams[1])) as { project_id: string; userId: string }
  expect(payload).toMatchObject({ project_id: 'project-1', userId: 'surveyor-1' })
})

test.each([
  { label: 'no service key configured', bearer: 'Bearer test-admin-key', configured: false },
  { label: 'no bearer token', bearer: undefined, configured: true },
  { label: 'wrong bearer token', bearer: 'Bearer wrong-key', configured: true },
])('POST /api/workers/process rejects $label before claiming jobs', async ({ bearer, configured }) => {
  if (!configured) delete process.env.API_ADMIN_KEY

  const response = await processRoute(workerRequest(bearer), {
    body: { limit: 1 },
    session: { user: { id: 'surveyor-1' } },
  } as unknown as Parameters<typeof processRoute>[1])

  expect(response.status).toBe(401)
  expect(mockQuery).not.toHaveBeenCalled()
})

test('the worker terminally fails a legacy unsupported job with a clear diagnostic', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{
      id: 'job-1',
      job_type: 'large_import',
      payload: {},
      attempts: 0,
      max_attempts: 3,
    }] })
    .mockResolvedValueOnce({ rows: [] })

  const response = await processRoute(
    workerRequest('Bearer test-admin-key'),
    { body: { limit: 1 } } as unknown as Parameters<typeof processRoute>[1],
  )
  const result = await response.json() as {
    jobs: Array<{ jobId: string; status: string; retries: number; error: string }>
  }

  expect(result.jobs[0]).toMatchObject({
    jobId: 'job-1',
    status: 'failed',
    retries: 0,
  })
  expect(result.jobs[0].error).toMatch(/no worker handler/)
  expect(mockQuery).toHaveBeenCalledTimes(2)
  const failureSql = (mockQuery.mock.calls[1] as [string, unknown[]])[0]
  expect(failureSql).toMatch(/SET status = 'failed'/)
  expect(failureSql).not.toMatch(/retry_count|scheduled_at|duration_ms|dead_letter/)
})
