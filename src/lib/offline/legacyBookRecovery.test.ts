/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB } from 'idb'
import { createHash } from 'node:crypto'
import { getDB, syncPendingOperations, type SyncOperation } from './syncQueue'
import { retainBookEdit, sendBookEdit, type BookEdit } from './bookEdits'
import { confirmLegacyBookDelivery, verifiedLegacyBookDelivery } from './legacyBookRecovery'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest } from '@/lib/fieldbook/delivery'
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', book = '33333333-3333-4333-8333-333333333333'
const edit: BookEdit = { requestId: '44444444-4444-4444-8444-444444444444', projectId: project, bookId: book, type: 'leveling', name: 'Recovered run', data: { bs: '1.5000', height: null }, basis: { kind: 'new' } }
const operation: SyncOperation = { id: 7, table: 'fieldbooks', type: 'UPSERT', data: { id: book, user_id: actor, project_id: project, type: edit.type, name: edit.name, data: edit.data }, timestamp: '2026-10-21T08:00:00Z', projectId: project, retries: 3, priority: 'normal' }
const sha = (value: Parameters<typeof canonicalDeliveryJson>[0]) => createHash('sha256').update(canonicalDeliveryJson(value)).digest('hex')
const originalFetch = global.fetch
beforeEach(async () => {
  await deleteDB('metardu-book-edits'); await deleteDB('metardu-book-delivery-journal')
  const database = await getDB(); await database.clear('sync_queue'); await database.put('sync_queue', structuredClone(operation))
  global.fetch = jest.fn(async (_url, options) => {
    const request = JSON.parse(String(options?.body)) as FieldbookSaveRequest
    return new Response(JSON.stringify({ receipt: { protocol: request.protocol, fieldVerified: false, actorId: actor, projectId: project, bookId: request.bookId, requestId: request.requestId,
      inputHash: sha(request), payloadHash: sha(fieldbookEditablePayload(actor, request)), baseRevision: request.baseRevision, savedRevision: '8' },
      book: { ...fieldbookEditablePayload(actor, request), status: 'active', revision: '8', created_at: null, updated_at: null }, currentRevision: '8', replayed: false }), { status: 200 })
  })
})
afterAll(() => { global.fetch = originalFetch })
test('exact delivery confirmation annotates an unchanged legacy source without deleting or rewriting it', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId)
  await confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))
  const stored = await (await getDB()).get('sync_queue', 7)
  if (!stored) throw new Error('Missing retained operation')
  expect(stored).toMatchObject(operation)
  expect(await verifiedLegacyBookDelivery(actor, project, stored)).toMatchObject({ requestId: edit.requestId, savedBookId: book, savedRevision: '8', reviewedBy: actor, fieldVerified: false })
  expect(await (await getDB()).count('sync_queue')).toBe(1)
})
test('an unacknowledged edit cannot reconcile a legacy pending operation', async () => {
  await retainBookEdit(actor, edit)
  await expect(confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))).rejects.toThrow()
  expect(await (await getDB()).get('sync_queue', 7)).toEqual(operation)
})
test('changed raw precision cannot borrow another snapshot delivery receipt', async () => {
  await retainBookEdit(actor, { ...edit, data: { bs: '1.5', height: null } }); await sendBookEdit(actor, project, edit.requestId)
  await expect(confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))).rejects.toThrow()
  expect(await (await getDB()).get('sync_queue', 7)).toEqual(operation)
})
test('a changed source after confirmation is pending again, with all raw values retained', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId); await confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))
  const database = await getDB(), stored = await database.get('sync_queue', 7)
  if (!stored) throw new Error('Missing retained operation')
  stored.data = { ...stored.data, data: { bs: '2.0000' } }; await database.put('sync_queue', stored)
  expect(await verifiedLegacyBookDelivery(actor, project, stored)).toBeNull()
  expect((await database.get('sync_queue', 7))?.data.data).toEqual({ bs: '2.0000' })
})
test('another account cannot attach or reuse a confirmation', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId)
  await expect(confirmLegacyBookDelivery(book, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))).rejects.toThrow()
  expect(await verifiedLegacyBookDelivery(book, project, operation)).toBeNull()
  expect(await (await getDB()).get('sync_queue', 7)).toEqual(operation)
})
test('a separate recovered book can be explicitly linked without retagging the original book id', async () => {
  const separate = { ...edit, bookId: '55555555-5555-4555-8555-555555555555' }
  await retainBookEdit(actor, separate); await sendBookEdit(actor, project, edit.requestId)
  await confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))
  const stored = await (await getDB()).get('sync_queue', 7)
  if (!stored) throw new Error('Missing retained operation')
  expect(stored.data.id).toBe(book)
  expect(await verifiedLegacyBookDelivery(actor, project, stored)).toMatchObject({ savedBookId: separate.bookId })
})
test('a verified recovered legacy source is retained without being counted as another failed replay', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId); await confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))
  const result = await syncPendingOperations({ from: () => { throw new Error('Legacy source must not be replayed') }, auth: { getSession: async () => ({ data: { session: { user: { id: actor } } } }) } })
  expect(result).toEqual({ synced: 0, failed: 0, conflicts: 0 })
  expect(await (await getDB()).count('sync_queue')).toBe(1)
})
test('a source mutation during confirmation cannot acquire a stale delivery link', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId)
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  const interception = jest.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    const result = await digest(...args)
    await (await getDB()).put('sync_queue', { ...operation, data: { ...operation.data, data: { bs: '2.0000' } } })
    return result
  })
  try {
    await expect(confirmLegacyBookDelivery(actor, project, 7, edit.requestId, sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0]))).rejects.toThrow()
    const stored = await (await getDB()).get('sync_queue', 7)
    expect(stored?.fieldbookRecovery).toBeUndefined(); expect(stored?.data.data).toEqual({ bs: '2.0000' })
  } finally { interception.mockRestore() }
})
test('the source shown for review cannot be silently replaced before confirmation starts', async () => {
  await retainBookEdit(actor, edit); await sendBookEdit(actor, project, edit.requestId)
  const reviewedHash = sha(operation as unknown as Parameters<typeof canonicalDeliveryJson>[0])
  await (await getDB()).put('sync_queue', { ...operation, data: { ...operation.data, originalNote: 'Different retained context' } })
  await expect(confirmLegacyBookDelivery(actor, project, 7, edit.requestId, reviewedHash)).rejects.toThrow()
  expect((await (await getDB()).get('sync_queue', 7))?.fieldbookRecovery).toBeUndefined()
})
