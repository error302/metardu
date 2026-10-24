/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/api/errors'
import { db } from '@/lib/db'
import { loadGateInputForProject } from '@/lib/validation/statutoryGateLoader'
import { uploadFile, downloadFile } from '@/lib/storage'
import { POST as generate } from '@/app/api/submission/generate/route'
import { POST as fullPackage } from '@/app/api/submission/package/route'
import { POST as assemble } from '@/app/api/submission/assemble/route'
import { createClient } from '@/lib/api-client/server'

// This adapter exercises actual route bodies, not session/schema/rate-limit behavior.
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (request: NextRequest, context: { userId: string; body: unknown }) => Promise<Response>) =>
  async (request: NextRequest) => {
    try { return await handler(request, { userId: 'owner', body: await request.json() }) }
    catch (error) {
      if (error instanceof AppError) return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.statusCode })
      throw error
    }
  } }))
jest.mock('@/lib/db', () => { const db = { query: jest.fn() }; return { __esModule: true, default: db, db } })
jest.mock('@/lib/validation/statutoryGateLoader', () => ({ loadGateInputForProject: jest.fn(), mergeGateInput: jest.requireActual<typeof import('@/lib/validation/statutoryGateLoader')>('@/lib/validation/statutoryGateLoader').mergeGateInput }))
jest.mock('@/lib/survey/fetchSurveyorProfile', () => ({ fetchSurveyorProfile: jest.fn(async () => ({ surveyorName: 'Synthetic', licenseNumber: 'ISK/LS/2020/123' })) }))
jest.mock('@/lib/storage', () => ({ uploadFile: jest.fn(), downloadFile: jest.fn(), getSignedUrl: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/api-client/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const projectId = '00000000-0000-4000-8000-000000000001'
const request = () => new NextRequest('http://127.0.0.1/api/submission', { method: 'POST', body: JSON.stringify({ projectId, documentId: 'deed-plan' }) })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(db.query).mockResolvedValue({ rows: [{ id: projectId, survey_type: 'cadastral' }] } as never)
  jest.mocked(loadGateInputForProject).mockResolvedValue(null)
})

test.each([['generate', generate], ['package', fullPackage], ['assemble', assemble]] as const)('%s refuses missing evidence without overwriting a ready artifact', async (_name, route) => {
  const result = await route(request(), {})
  expect(result.status).toBe(503)
  expect(await result.json()).toMatchObject({ code: 'SUBMISSION_EVIDENCE_UNAVAILABLE' })
  expect(jest.mocked(db.query).mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false)
  expect(uploadFile).not.toHaveBeenCalled()
  expect(downloadFile).not.toHaveBeenCalled()
  expect(createClient).not.toHaveBeenCalled()
})

test.each([['generate', generate], ['package', fullPackage], ['assemble', assemble]] as const)('%s requires ownership before loading any survey evidence', async (_name, route) => {
  jest.mocked(db.query).mockResolvedValue({ rows: [] } as never)
  expect((await route(request(), {})).status).toBe(404)
  expect(loadGateInputForProject).not.toHaveBeenCalled()
  expect(createClient).not.toHaveBeenCalled()
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), [projectId, 'owner'])
})
