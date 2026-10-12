jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  },
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ setCurrentUserId: jest.fn() }))
jest.mock('@/lib/security/projectAccess', () => ({ checkProjectAccess: jest.fn() }))
jest.mock('@/lib/survey/audit-store', () => ({
  storeAuditEntry: jest.fn(),
  getAuditEntriesBySurvey: jest.fn(),
  getAuditEntriesByProject: jest.fn(),
  getAuditEntryById: jest.fn(),
  getAuditStats: jest.fn(),
  verifyAuditChain: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { checkProjectAccess } from '@/lib/security/projectAccess'
import { storeAuditEntry } from '@/lib/survey/audit-store'
import { GET, POST } from './route'

const mockedGetSession = getServerSession as jest.Mock
const mockedProjectAccess = checkProjectAccess as jest.Mock
const mockedStoreAuditEntry = storeAuditEntry as jest.Mock

describe('/api/survey/audit authorization', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects audit reads for a project the signed-in user cannot access', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockedProjectAccess.mockResolvedValueOnce({ allowed: false, isOwner: false, memberRole: null })

    const response = await GET(new Request('https://metardu.test/api/survey/audit?projectId=private-project') as never)

    expect(response.status).toBe(404)
  })

  it('records the authenticated user as the author, ignoring a caller-supplied user id', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockedProjectAccess.mockResolvedValueOnce({ allowed: true, isOwner: true, memberRole: null })

    const response = await POST(new Request('https://metardu.test/api/survey/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surveyId: 'survey-1',
        projectId: 'project-1',
        userId: 'attacker-controlled-id',
        operation: 'area_computation',
        inputs: { area: 100 },
        outputs: { area: 100 },
        formula: 'test',
        reference: 'test-only',
      }),
    }) as never)

    expect(response.status).toBe(201)
    expect(mockedStoreAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
  })
})
