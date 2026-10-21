/** @jest-environment node */
import { createHash } from 'node:crypto'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest, type FieldbookSaveResult } from './delivery'
import { acknowledgeBookDelivery, deliverBookRequest, readReviewedBook } from './deliveryClient'

const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', book = '33333333-3333-4333-8333-333333333333'
const request: FieldbookSaveRequest = { protocol: 'fieldbook-save-v1', requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId: book,
  baseRevision: '7', name: 'Retained run', type: 'leveling', data: { bs: '1.5000', height: null } }
const sha = (value: Parameters<typeof canonicalDeliveryJson>[0]) => createHash('sha256').update(canonicalDeliveryJson(value)).digest('hex')
function acknowledgement(): FieldbookSaveResult { return { receipt: { protocol: 'fieldbook-save-v1', fieldVerified: false, actorId: actor, projectId: project, bookId: book,
  requestId: request.requestId, inputHash: sha(request), payloadHash: sha(fieldbookEditablePayload(actor, request)), baseRevision: '7', savedRevision: '8' },
  book: { id: book, user_id: actor, project_id: project, name: request.name, type: request.type, data: structuredClone(request.data), status: 'active', revision: '8', created_at: null, updated_at: null },
  currentRevision: '8', replayed: false } }
const originalFetch = global.fetch
beforeEach(() => { global.fetch = jest.fn() })
afterAll(() => { global.fetch = originalFetch })

test('an exact receipt binds the owner, raw strings, baseline and saved revision', async () => {
  expect(await acknowledgeBookDelivery(actor, request, acknowledgement())).toMatchObject({ book: { revision: '8', data: { bs: '1.5000', height: null } } })
})
test.each(['id-only', 'other-owner', 'other-request', 'other-baseline', 'changed-raw', 'false-verification', 'rewound-revision', 'missing-current', 'unexpected-current'])('%s cannot acknowledge a retained book request', async scenario => {
  const result = acknowledgement()
  if (scenario === 'other-owner') result.receipt.actorId = project
  if (scenario === 'other-request') result.receipt.requestId = book
  if (scenario === 'other-baseline') result.receipt.baseRevision = '6'
  if (scenario === 'changed-raw') result.book.data.bs = '1.5'
  if (scenario === 'false-verification') (result.receipt as { fieldVerified: boolean }).fieldVerified = true
  if (scenario === 'rewound-revision') { result.receipt.savedRevision = '7'; result.book.revision = '7'; result.currentRevision = '7' }
  if (scenario === 'missing-current') result.currentRevision = null
  if (scenario === 'unexpected-current') result.currentRevision = '9'
  await expect(acknowledgeBookDelivery(actor, request, scenario === 'id-only' ? { id: book } : result)).rejects.toThrow()
})
test('an old receipt may acknowledge its own snapshot while reporting a newer current book', async () => {
  const result = acknowledgement(); result.replayed = true; result.currentRevision = '12'
  expect(await acknowledgeBookDelivery(actor, request, result)).toMatchObject({ currentRevision: '12', replayed: true, book: { revision: '8' } })
})
test('transport keeps an immutable request across caller edits while binding HTTP to its retained owner', async () => {
  const mutable = structuredClone(request)
  jest.mocked(fetch).mockImplementation(async (_url, init) => {
    mutable.data.bs = '999'
    expect(JSON.parse(String(init?.body))).toEqual(request)
    expect(new Headers(init?.headers).get('X-Metardu-Expected-User')).toBe(actor)
    return new Response(JSON.stringify(acknowledgement()), { status: 200 })
  })
  expect(await deliverBookRequest(actor, mutable)).toMatchObject({ book: { data: { bs: '1.5000' } } })
})
test('schema unready and transport uncertainty remain explicit failed acknowledgements', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Keep device copy', code: 'FIELDBOOK_DELIVERY_SCHEMA' }), { status: 503 }))
  await expect(deliverBookRequest(actor, request)).rejects.toMatchObject({ status: 503, code: 'FIELDBOOK_DELIVERY_SCHEMA' })
  jest.mocked(fetch).mockRejectedValueOnce(new Error('Lost response'))
  await expect(deliverBookRequest(actor, request)).rejects.toThrow()
})
test('a reviewed baseline cannot be taken from another project, author or book', async () => {
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ book: { ...acknowledgement().book, project_id: book } }), { status: 200 }))
  await expect(readReviewedBook(actor, project, book)).rejects.toThrow()
})
test('validation returns the checked snapshot even if the caller mutates a response during hashing', async () => {
  const result = acknowledgement()
  const validating = acknowledgeBookDelivery(actor, request, result)
  result.book.data.bs = '999'
  expect(await validating).toMatchObject({ book: { data: { bs: '1.5000' } } })
})
test('invalid runtime numbers are refused before JSON serialization can turn them into unknown heights', async () => {
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(acknowledgement()), { status: 200 }))
  await expect(deliverBookRequest(actor, { ...request, data: { height: NaN } })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
