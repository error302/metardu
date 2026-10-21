/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB, openDB, type DBSchema } from 'idb'
import { createHash } from 'node:crypto'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest } from '@/lib/fieldbook/delivery'
import { retainBookEdit, listBookEdits, sendBookEdit, sendBookEdits, exportBookEditRecords, bookSaveOriginSchema, type BookEdit } from './bookEdits'
import { retainBookRequest, sendRetainedBookRequest } from './bookDeliveryJournal'
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', book = '33333333-3333-4333-8333-333333333333'
const edit: BookEdit = { requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId: book, type: 'leveling', name: 'Raw run', data: { bs: '1.5000', height: null }, basis: { kind: 'new' } }
const sha = (value: Parameters<typeof canonicalDeliveryJson>[0]) => createHash('sha256').update(canonicalDeliveryJson(value)).digest('hex')
const originalFetch = global.fetch
beforeEach(async () => { await deleteDB('metardu-book-edits'); await deleteDB('metardu-book-delivery-journal'); global.fetch = jest.fn() })
afterAll(() => { global.fetch = originalFetch })
function respond(revision: string, current = revision) { return async (_url: unknown, options?: RequestInit) => {
  const input = JSON.parse(String(options?.body)) as FieldbookSaveRequest
  return new Response(JSON.stringify({ receipt: { protocol: input.protocol, fieldVerified: false, actorId: actor, projectId: project, bookId: input.bookId, requestId: input.requestId,
    inputHash: sha(input), payloadHash: sha(fieldbookEditablePayload(actor, input)), baseRevision: input.baseRevision, savedRevision: revision },
  book: { ...fieldbookEditablePayload(actor, input), status: 'active', revision, created_at: null, updated_at: null }, currentRevision: current, replayed: current !== revision }), { status: 200 })
} }
test('offline edits retain an explicit parent and dispatch in causal order after recovery', async () => {
  await retainBookEdit(actor, edit)
  const child: BookEdit = { ...edit, requestId: '55555555-5555-4555-8555-555555555555', data: { bs: '1.7500' }, basis: { kind: 'operation', requestId: edit.requestId } }
  await retainBookEdit(actor, child)
  jest.mocked(fetch).mockImplementationOnce(respond('8')).mockImplementationOnce(respond('9'))
  await sendBookEdit(actor, project, child.requestId)
  const bodies = jest.mocked(fetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)) as FieldbookSaveRequest)
  expect(bodies.map(item => [item.requestId, item.baseRevision, item.data.bs])).toEqual([[edit.requestId, null, '1.5000'], [child.requestId, '8', '1.7500']])
  expect(await listBookEdits(actor, project)).toHaveLength(2)
})
test('a replay reporting a newer current revision cannot rebase a child onto unreviewed work', async () => {
  await retainBookEdit(actor, edit)
  const child: BookEdit = { ...edit, requestId: '55555555-5555-4555-8555-555555555555', basis: { kind: 'operation', requestId: edit.requestId } }
  await retainBookEdit(actor, child)
  jest.mocked(fetch).mockImplementationOnce(respond('8', '12')).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Review both versions' }), { status: 409 }))
  await expect(sendBookEdit(actor, project, child.requestId)).rejects.toMatchObject({ status: 409 })
  expect(JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({ baseRevision: '8' })
  expect(await listBookEdits(actor, project)).toHaveLength(2)
})
test('unknown legacy baselines remain durable without a network mutation', async () => {
  await retainBookEdit(actor, { ...edit, basis: { kind: 'unknown' } })
  await expect(sendBookEdit(actor, project, edit.requestId)).rejects.toThrow()
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit: { basis: { kind: 'unknown' } }, result: null }])
  expect(fetch).not.toHaveBeenCalled()
})
test('a parent from another book cannot supply revision authority and the child is preserved', async () => {
  await retainBookEdit(actor, edit)
  const child = { ...edit, bookId: '66666666-6666-4666-8666-666666666666', requestId: '55555555-5555-4555-8555-555555555555', basis: { kind: 'operation' as const, requestId: edit.requestId } }
  await retainBookEdit(actor, child)
  await expect(sendBookEdit(actor, project, child.requestId)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  expect(await listBookEdits(actor, project)).toHaveLength(2)
})
test('another account cannot inspect or export retained edits', async () => {
  await retainBookEdit(actor, edit)
  expect(await listBookEdits(book, project)).toEqual([])
  expect(await exportBookEditRecords(book, project)).toEqual([])
  await expect(sendBookEdit(book, project, edit.requestId)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
test('a cyclic edit ancestry is retained for inspection without a network mutation', async () => {
  await retainBookEdit(actor, { ...edit, basis: { kind: 'operation', requestId: edit.requestId } })
  await expect(sendBookEdit(actor, project, edit.requestId)).rejects.toThrow('ancestry')
  expect(await exportBookEditRecords(actor, project)).toHaveLength(1)
  expect(fetch).not.toHaveBeenCalled()
})
test('quota failure leaves the previous edit intact and cannot report a durable new snapshot', async () => {
  await retainBookEdit(actor, edit)
  const add = jest.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => { throw new DOMException('Full storage', 'QuotaExceededError') })
  try {
    await expect(retainBookEdit(actor, { ...edit, requestId: '55555555-5555-4555-8555-555555555555' })).rejects.toThrow('Full storage')
    expect(await listBookEdits(actor, project)).toMatchObject([{ edit }])
    expect(fetch).not.toHaveBeenCalled()
  } finally { add.mockRestore() }
})
test('one batch has twenty HTTP attempts across all independent branches and retains the remainder', async () => {
  const ids: string[] = []
  for (let index = 1; index <= 25; index++) {
    const id = `55555555-5555-4555-8555-${index.toString().padStart(12, '0')}`
    ids.push(id); await retainBookEdit(actor, { ...edit, requestId: id, bookId: id })
  }
  jest.mocked(fetch).mockImplementation(respond('8'))
  expect(await sendBookEdits(actor, project, ids)).toMatchObject({ synced: 20, failed: 0, deferred: 5, attempted: 20 })
  expect(fetch).toHaveBeenCalledTimes(20)
  expect((await listBookEdits(actor, project)).filter(item => !item.result)).toHaveLength(5)
})
test('an uncertain transport stops a batch after one attempt rather than hammering the remaining queue', async () => {
  const second = { ...edit, requestId: '55555555-5555-4555-8555-555555555555', bookId: '66666666-6666-4666-8666-666666666666' }
  await retainBookEdit(actor, edit); await retainBookEdit(actor, second)
  jest.mocked(fetch).mockRejectedValue(new Error('Connection lost'))
  expect(await sendBookEdits(actor, project, [edit.requestId, second.requestId])).toMatchObject({ synced: 0, failed: 1, deferred: 1, attempted: 1 })
  expect(fetch).toHaveBeenCalledTimes(1)
})
test('concurrent immediate and manual retries send a retained request once in this application instance', async () => {
  await retainBookEdit(actor, edit)
  jest.mocked(fetch).mockImplementation(respond('8'))
  const results = await Promise.all([sendBookEdit(actor, project, edit.requestId), sendBookEdit(actor, project, edit.requestId)])
  expect(results.map(value => value.receipt.savedRevision)).toEqual(['8', '8'])
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a shared server retry window defers the next batch without counting an HTTP attempt or another failure', async () => {
  await retainBookEdit(actor, edit)
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
  expect(await sendBookEdits(actor, project, [edit.requestId])).toMatchObject({ attempted: 1, failed: 1, deferred: 0 })
  expect(await sendBookEdits(actor, project, [edit.requestId])).toMatchObject({ attempted: 0, failed: 0, deferred: 1 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('corrupt retry ownership stops delivery without counting a network attempt or changing retained readings', async () => {
  await retainBookEdit(actor, edit)
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
  await sendBookEdits(actor, project, [edit.requestId])
  interface RetryDB extends DBSchema { retries: { key: string; value: Record<string, unknown> } }
  const database = await openDB<RetryDB>('metardu-book-delivery-journal')
  const state = await database.get('retries', `actor:${actor}`)
  if (!state) throw new Error('Expected a retained throttle')
  await database.put('retries', { ...state, actorId: project }); database.close()
  expect(await sendBookEdits(actor, project, [edit.requestId])).toMatchObject({ attempted: 0, failed: 1, deferred: 0 })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit, result: null }])
})

test('an orphan recovered request replays its exact retained baseline without inventing parent work', async () => {
  const origin = bookSaveOriginSchema.safeParse({ kind: 'retained_request' })
  expect(origin.success).toBe(true)
  if (!origin.success) return
  const recovered = { ...edit, basis: origin.data }
  const { basis: _basis, ...raw } = edit
  await retainBookEdit(actor, recovered)
  await retainBookRequest(actor, { ...raw, protocol: 'fieldbook-save-v1', baseRevision: '8' })
  jest.mocked(fetch).mockImplementation(respond('9'))
  await sendBookEdit(actor, project, edit.requestId)
  expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ requestId: edit.requestId, baseRevision: '8', data: { bs: '1.5000', height: null } })
})

test('a recovered edit with no exact retained request cannot invent a baseline', async () => {
  await retainBookEdit(actor, { ...edit, basis: { kind: 'retained_request' } })
  await expect(sendBookEdit(actor, project, edit.requestId)).rejects.toThrow(/unavailable/)
  expect(fetch).not.toHaveBeenCalled()
})

test('a retained request cannot acknowledge different editable content under the same operation ID', async () => {
  const { basis: _basis, ...raw } = edit
  await retainBookRequest(actor, { ...raw, protocol: 'fieldbook-save-v1', baseRevision: null })
  jest.mocked(fetch).mockImplementation(respond('8'))
  await sendRetainedBookRequest(actor, project, edit.requestId)
  await retainBookEdit(actor, { ...edit, data: { bs: '9.9999', height: null } })
  await expect(listBookEdits(actor, project)).rejects.toThrow()
  await expect(sendBookEdit(actor, project, edit.requestId)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await exportBookEditRecords(actor, project)).toMatchObject([{ edit: { data: { bs: '9.9999' } } }])
})
