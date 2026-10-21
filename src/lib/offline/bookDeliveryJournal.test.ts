/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB, openDB, type DBSchema } from 'idb'
import { createHash } from 'node:crypto'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest, type FieldbookSaveResult } from '@/lib/fieldbook/delivery'
import { retainBookRequest, listBookRequests, sendRetainedBookRequest, type RetainedBookRequest } from './bookDeliveryJournal'

interface TestJournal extends DBSchema { requests: { key: string; value: RetainedBookRequest & { key: string } } }

const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', book = '33333333-3333-4333-8333-333333333333'
const input: FieldbookSaveRequest = { protocol: 'fieldbook-save-v1', requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId: book,
  baseRevision: null, type: 'leveling', name: 'Original run', data: { bs: '1.5000', height: null } }
const sha = (value: Parameters<typeof canonicalDeliveryJson>[0]) => createHash('sha256').update(canonicalDeliveryJson(value)).digest('hex')
function reply(request = input): FieldbookSaveResult { return { receipt: { protocol: request.protocol, fieldVerified: false, actorId: actor, projectId: project, bookId: book,
  requestId: request.requestId, inputHash: sha(request), payloadHash: sha(fieldbookEditablePayload(actor, request)), baseRevision: request.baseRevision, savedRevision: '8' },
  book: { id: book, project_id: project, user_id: actor, type: request.type, name: request.name, data: structuredClone(request.data), status: 'active', revision: '8', created_at: null, updated_at: null },
  currentRevision: '8', replayed: false } }
const originalFetch = global.fetch
beforeEach(async () => { await deleteDB('metardu-book-delivery-journal'); global.fetch = jest.fn() })
afterAll(() => { global.fetch = originalFetch })

test('reopening the journal retains the exact request and no HTTP is sent before explicit delivery', async () => {
  const mutable = structuredClone(input)
  await retainBookRequest(actor, mutable)
  mutable.data.bs = '999'
  expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: null }])
  expect(fetch).not.toHaveBeenCalled()
})
test('two contenders cannot bind the same request key to different payloads', async () => {
  const outcomes = await Promise.allSettled([retainBookRequest(actor, input), retainBookRequest(actor, { ...input, data: { bs: '2.0000' } })])
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
  const retained = await listBookRequests(actor, project)
  expect(retained).toHaveLength(1)
  expect(['1.5000', '2.0000']).toContain(retained[0].request.data.bs)
})
test('a lost response retains the same dispatch identity through any number of explicit retries', async () => {
  await retainBookRequest(actor, input)
  jest.mocked(fetch).mockRejectedValue(new Error('Lost acknowledgement'))
  for (let count = 0; count < 4; count++) await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toThrow()
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(reply()), { status: 200 }))
  await sendRetainedBookRequest(actor, project, input.requestId)
  expect(jest.mocked(fetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)) as unknown)).toEqual(Array(5).fill(input))
  expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: { receipt: { savedRevision: '8' } } }])
})
test('an older in-flight acknowledgement cannot clear, replace or acknowledge a later retained edit', async () => {
  await retainBookRequest(actor, input)
  let release!: (value: Response) => void
  let started!: () => void
  const dispatchStarted = new Promise<void>(resolve => { started = resolve })
  jest.mocked(fetch).mockImplementation(() => { started(); return new Promise(resolve => { release = resolve }) })
  const sending = sendRetainedBookRequest(actor, project, input.requestId)
  await dispatchStarted
  const later = { ...input, requestId: '55555555-5555-4555-8555-555555555555', data: { bs: '1.7500' } }
  await retainBookRequest(actor, later)
  release(new Response(JSON.stringify(reply()), { status: 200 }))
  await sending
  const requests = await listBookRequests(actor, project)
  expect(requests).toHaveLength(2)
  expect(requests.find(item => item.request.requestId === later.requestId)).toMatchObject({ request: later, result: null })
  expect(requests.find(item => item.request.requestId === input.requestId)?.result?.book.data.bs).toBe('1.5000')
})
test('another account or project cannot read or dispatch the retained request', async () => {
  await retainBookRequest(actor, input)
  expect(await listBookRequests(book, project)).toEqual([])
  await expect(sendRetainedBookRequest(book, project, input.requestId)).rejects.toThrow()
  await expect(sendRetainedBookRequest(actor, book, input.requestId)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
test('tampered stored payloads stay retained and cannot be sent or falsely acknowledged', async () => {
  await retainBookRequest(actor, input)
  const database = await openDB<TestJournal>('metardu-book-delivery-journal')
  const stored = (await database.getAll('requests'))[0]
  stored.request.data.bs = '999'
  await database.put('requests', stored); database.close()
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toThrow()
  const check = await openDB<TestJournal>('metardu-book-delivery-journal')
  expect(await check.count('requests')).toBe(1); check.close()
  expect(fetch).not.toHaveBeenCalled()
})
test('an ID-only acknowledgement leaves the exact request pending', async () => {
  await retainBookRequest(actor, input)
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: book }), { status: 200 }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toThrow()
  expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: null }])
})
test('device storage failure cannot create a dispatched request or discard an existing one', async () => {
  await retainBookRequest(actor, input)
  const add = jest.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
  try {
    await expect(retainBookRequest(actor, { ...input, requestId: '55555555-5555-4555-8555-555555555555' })).rejects.toThrow('Storage full')
    expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: null }])
    expect(fetch).not.toHaveBeenCalled()
  } finally { add.mockRestore() }
})
test('a changed device request during dispatch cannot receive an older acknowledgement', async () => {
  await retainBookRequest(actor, input)
  jest.mocked(fetch).mockImplementation(async () => {
    const database = await openDB<TestJournal>('metardu-book-delivery-journal')
    const stored = (await database.getAll('requests'))[0]
    stored.request.data.bs = '999'
    await database.put('requests', stored); database.close()
    return new Response(JSON.stringify(reply()), { status: 200 })
  })
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toThrow()
  const database = await openDB<TestJournal>('metardu-book-delivery-journal')
  const retained = (await database.getAll('requests'))[0]; database.close()
  expect(retained.request.data.bs).toBe('999'); expect(retained.result).toBeNull()
})
test('an older retry response cannot rewind knowledge of a later server revision', async () => {
  await retainBookRequest(actor, input)
  let release!: (value: Response) => void
  let started!: () => void
  const dispatched = new Promise<void>(resolve => { started = resolve })
  jest.mocked(fetch).mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve }) })
  const oldResponse = sendRetainedBookRequest(actor, project, input.requestId)
  await dispatched
  const current = reply(); current.replayed = true; current.currentRevision = '12'
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(current), { status: 200 }))
  await sendRetainedBookRequest(actor, project, input.requestId)
  release(new Response(JSON.stringify(reply()), { status: 200 }))
  expect(await oldResponse).toMatchObject({ currentRevision: '12', replayed: true })
  expect(await listBookRequests(actor, project)).toMatchObject([{ result: { currentRevision: '12', replayed: true } }])
})
test('non-finite input cannot be silently retained as a different raw value', async () => {
  await expect(retainBookRequest(actor, { ...input, data: { height: NaN } })).rejects.toThrow()
  expect(await listBookRequests(actor, project)).toEqual([])
})
