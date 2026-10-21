/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB, openDB, type DBSchema } from 'idb'
import { createHash } from 'node:crypto'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest, type FieldbookSaveResult } from '@/lib/fieldbook/delivery'
import { retainBookRequest, listBookRequests, sendRetainedBookRequest, exportBookRequestRecords, type RetainedBookRequest } from './bookDeliveryJournal'

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
afterEach(() => jest.restoreAllMocks())
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
test('recovery archive exports only the retained owner and project records', async () => {
  await retainBookRequest(actor, input)
  expect(await exportBookRequestRecords(actor, project)).toMatchObject([{ actorId: actor, request: input }])
  expect(await exportBookRequestRecords(book, project)).toEqual([])
  expect(await exportBookRequestRecords(actor, book)).toEqual([])
})

test('a persisted throttle window prevents manual retry on the same actor in another project without changing either raw request', async () => {
  let now = 1700000000000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  const other = { ...input, requestId: '55555555-5555-4555-8555-555555555555', projectId: book }
  await retainBookRequest(actor, input); await retainBookRequest(actor, other)
  const original = await exportBookRequestRecords(actor, project)
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Please wait' }), { status: 429, headers: { 'Retry-After': '120' } }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toMatchObject({ status: 429 })
  await expect(sendRetainedBookRequest(actor, book, other.requestId)).rejects.toMatchObject({ code: 'FIELDBOOK_DELIVERY_DEFERRED' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await exportBookRequestRecords(actor, project)).toEqual(original)
  expect(await listBookRequests(actor, book)).toMatchObject([{ request: other, result: null }])
  now += 120000
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(reply()), { status: 200 }))
  expect(await sendRetainedBookRequest(actor, project, input.requestId)).toMatchObject({ receipt: { savedRevision: '8' } })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a valid server overload Retry-After date cannot be bypassed by an explicit delivery retry', async () => {
  let now = 1700000000000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  await retainBookRequest(actor, input)
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503, headers: { 'Retry-After': 'Tue, 14 Nov 2023 22:15:20 GMT' } }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toMatchObject({ status: 503 })
  now += 119000
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toMatchObject({ code: 'FIELDBOOK_DELIVERY_DEFERRED' })
  expect(fetch).toHaveBeenCalledTimes(1)
  now += 1000
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(reply()), { status: 200 }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).resolves.toMatchObject({ receipt: { savedRevision: '8' } })
})

test('one actor throttle cannot prevent another retained owner from reaching the server', async () => {
  await retainBookRequest(actor, input); await retainBookRequest(book, input)
  jest.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toMatchObject({ status: 429 })
  await expect(sendRetainedBookRequest(book, project, input.requestId)).rejects.toMatchObject({ status: 503 })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('an older in-flight success cannot erase a newer actor throttle from a different request', async () => {
  const other = { ...input, requestId: '55555555-5555-4555-8555-555555555555' }
  await retainBookRequest(actor, input); await retainBookRequest(actor, other)
  let release!: (value: Response) => void
  let started!: () => void
  const dispatched = new Promise<void>(resolve => { started = resolve })
  jest.mocked(fetch).mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve }) })
  const first = sendRetainedBookRequest(actor, project, input.requestId)
  await dispatched
  jest.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
  await expect(sendRetainedBookRequest(actor, project, other.requestId)).rejects.toMatchObject({ status: 429 })
  release(new Response(JSON.stringify(reply()), { status: 200 })); await first
  await expect(sendRetainedBookRequest(actor, project, other.requestId)).rejects.toMatchObject({ code: 'FIELDBOOK_DELIVERY_DEFERRED' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: { receipt: { savedRevision: '8' } } }, { request: other, result: null }])
})

test('opening a version-one journal adds retry storage without rewriting its original request or receipt', async () => {
  const original = { version: 1, key: `${actor}:${input.requestId}`, actorId: actor, request: input, requestHash: sha(input), result: reply() }
  const previous = await openDB<TestJournal>('metardu-book-delivery-journal', 1, { upgrade(database) { database.createObjectStore('requests', { keyPath: 'key' }) } })
  await previous.put('requests', original); previous.close()
  expect(await listBookRequests(actor, project)).toMatchObject([{ request: input, result: reply() }])
  expect(await exportBookRequestRecords(actor, project)).toEqual([original])
  expect(fetch).not.toHaveBeenCalled()
})

test.each(['garbage', '1e999', '9'.repeat(400)])('an invalid Retry-After value cannot make explicit recovery permanently unavailable (%s)', async header => {
  await retainBookRequest(actor, input)
  jest.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': header } }))
    .mockResolvedValueOnce(new Response(JSON.stringify(reply()), { status: 200 }))
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).rejects.toMatchObject({ status: 503 })
  await expect(sendRetainedBookRequest(actor, project, input.requestId)).resolves.toMatchObject({ receipt: { savedRevision: '8' } })
})
