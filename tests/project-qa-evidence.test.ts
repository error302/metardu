/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import type { RecordQaRunInput } from '@/lib/provenance/computationAndQa'
import type { ApiHandlerContext } from '@/lib/apiHandler'
const mockRecord = jest.fn<Promise<{ runId: string }>, [RecordQaRunInput]>().mockResolvedValue({ runId: 'run-1' })
const mockOwnership = jest.fn<Promise<{ ok: boolean; projectUserId: string | null }>, [string, string]>().mockResolvedValue({ ok: true, projectUserId: 'user-1' })
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (req: NextRequest, context: ApiHandlerContext) => Promise<NextResponse>) =>
  async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const body: unknown = await req.json()
    return handler(req, { params: await context.params, body, userId: 'user-1', session: null })
  } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectOwnership: (...args: [string, string]) => mockOwnership(...args) }))
jest.mock('@/lib/provenance/computationAndQa', () => ({ recordQaRun: (...args: [RecordQaRunInput]) => mockRecord(...args), listQaRuns: jest.fn() }))
import { POST } from '@/app/api/project/[id]/qa/route'
const measured = { checkType: 'closure', result: 'PASS', measuredValue: 0.01, thresholdValue: 0.02, unit: 'm', details: { rule: 'Absolute closure <= threshold', comparison: 'lte' } }
async function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/project/project-1/qa', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'project-1' }) })
}
beforeEach(() => { jest.clearAllMocks(); mockOwnership.mockResolvedValue({ ok: true, projectUserId: 'user-1' }) })
test('saves a fully described manual check after the wrapper consumed JSON exactly once', async () => {
  expect((await post({ dataRevision: 'SYN-R1', results: [measured] })).status).toBe(201)
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', toleranceProfile: null, dataRevision: 'SYN-R1' }))
})
test.each([
  { results: [measured] },
  { dataRevision: 'R1', results: [{ ...measured, thresholdValue: null }] },
  { dataRevision: 'R1', results: [{ ...measured, unit: '' }] },
  { dataRevision: 'R1', results: [{ ...measured, details: {} }] },
  { dataRevision: 'R1', results: [{ ...measured, measuredValue: 0.03 }] },
  { dataRevision: 'R1', trigger: 'on_compute', results: [measured] },
  { dataRevision: 'R1', results: [{ ...measured, result: 'FAIL' }] },
])('rejects incomplete, contradictory or impersonated automated evidence: %j', async body => {
  expect((await post(body)).status).toBe(400); expect(mockRecord).not.toHaveBeenCalled()
})
test('preserves a full snapshot and hashes changed measurements into a new revision', async () => {
  for (const distance of [100, 101]) expect((await post({ inputSnapshot: JSON.stringify({ distance }), results: [measured] })).status).toBe(201)
  const [first, second] = mockRecord.mock.calls.map(call => call[0])
  expect(first.dataRevision).toMatch(/^sha256:[A-Za-z0-9_-]{43}$/)
  expect(second.dataRevision).not.toBe(first.dataRevision)
  expect(first.results[0].details).toMatchObject({ inputSnapshot: { distance: 100 }, evidenceSource: 'client_reported', certified: false })
})
test('ownerless legacy projects cannot acquire QA evidence from an arbitrary account', async () => {
  mockOwnership.mockResolvedValue({ ok: true, projectUserId: null })
  expect((await post({ dataRevision: 'R1', results: [measured] })).status).toBe(403)
  expect(mockRecord).not.toHaveBeenCalled()
})
