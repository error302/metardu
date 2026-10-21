/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { z, type ZodSchema } from 'zod'
import { GET, POST } from './route'
import { readFieldbookRevision, saveFieldbookRevision } from '@/lib/fieldbook/deliveryServer'
import type { FieldbookSaveResult } from '@/lib/fieldbook/delivery'
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', bookId = '33333333-3333-4333-8333-333333333333'
jest.mock('@/lib/fieldbook/deliveryServer', () => ({ readFieldbookRevision: jest.fn(), saveFieldbookRevision: jest.fn() }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (options: { schema?: ZodSchema }, handler: (request: NextRequest, context: { userId: string; body: unknown }) => Promise<NextResponse>) => async (request: NextRequest) => {
  try {
    const body: unknown = request.method === 'POST' ? await request.json() : null
    return await handler(request, { userId: '11111111-1111-4111-8111-111111111111', body: options.schema ? options.schema.parse(body) : body })
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 422 }); throw error }
} }))
beforeEach(() => { jest.resetAllMocks() })
const input = { protocol: 'fieldbook-save-v1', requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId,
  baseRevision: null, name: 'Raw run', type: 'leveling', data: { rows: [{ station: 'BM', bs: '1.5000', fs: '', is: '' }] } }
const saved: FieldbookSaveResult = { book: { id: bookId, user_id: actor, project_id: project, type: 'leveling', name: input.name, data: input.data,
  status: 'active', revision: '8', created_at: '2026-10-21T08:00:00.000Z', updated_at: '2026-10-21T08:00:00.000Z' },
  receipt: { protocol: 'fieldbook-save-v1', fieldVerified: false, requestId: input.requestId, actorId: actor, projectId: project, bookId, inputHash: 'a'.repeat(64), payloadHash: 'b'.repeat(64), baseRevision: null, savedRevision: '8' },
  currentRevision: '8', replayed: true }
function post(body: unknown, expected = actor) { return POST(new NextRequest('http://127.0.0.1/api/fieldbook/delivery', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Metardu-Expected-User': expected }, body: JSON.stringify(body),
})) }

test('an account switch refuses delivery before any book mutation', async () => {
  expect((await post(input, 'another-account')).status).toBe(403)
  expect(saveFieldbookRevision).not.toHaveBeenCalled()
})
test('only the authenticated actor is sent to the revision authority and the response stays private', async () => {
  jest.mocked(saveFieldbookRevision).mockResolvedValue(saved)
  const response = await post(input)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(saveFieldbookRevision).toHaveBeenCalledWith(actor, input)
})
test.each([{ ...input, user_id: actor }, { ...input, baseRevision: 'tomorrow' }, { ...input, protocol: 'unversioned-save' }])('malformed or owner-supplied bodies cannot reach storage', async body => {
  expect((await post(body)).status).toBe(422)
  expect(saveFieldbookRevision).not.toHaveBeenCalled()
})
test('reading one revision requires the retained owner precondition and exact project/book identity', async () => {
  const url = `http://127.0.0.1/api/fieldbook/delivery?projectId=${project}&bookId=${bookId}`
  expect((await GET(new NextRequest(url))).status).toBe(403)
  expect(readFieldbookRevision).not.toHaveBeenCalled()
  jest.mocked(readFieldbookRevision).mockResolvedValue(saved.book)
  const response = await GET(new NextRequest(url, { headers: { 'X-Metardu-Expected-User': actor } }))
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(readFieldbookRevision).toHaveBeenCalledWith(actor, project, bookId)
})
