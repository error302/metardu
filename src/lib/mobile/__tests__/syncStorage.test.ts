import { offlineStorage, type SyncQueueItem } from '../offlineStorage'
import type { FieldObservation } from '../offlineStorage'
import { legacySourceHash } from '../legacyReview'

const descriptor = Object.getOwnPropertyDescriptor(offlineStorage, 'db')
const stateDescriptor = Object.getOwnPropertyDescriptor(offlineStorage, 'syncStateDb')
afterEach(() => {
  if (descriptor) Object.defineProperty(offlineStorage, 'db', descriptor)
  if (stateDescriptor) Object.defineProperty(offlineStorage, 'syncStateDb', stateDescriptor)
  jest.restoreAllMocks()
})

function database() {
  const getRequest = {} as IDBRequest
  const putRequest = {} as IDBRequest
  const tx = { objectStore: jest.fn(), error: null } as unknown as IDBTransaction
  const store = { get: jest.fn(() => getRequest), put: jest.fn((_value: unknown) => putRequest), delete: jest.fn(() => putRequest) }
  jest.mocked(tx.objectStore).mockReturnValue(store as unknown as IDBObjectStore)
  Object.defineProperty(offlineStorage, 'db', { configurable: true, writable: true, value: { transaction: () => tx } })
  Object.defineProperty(offlineStorage, 'syncStateDb', { configurable: true, writable: true, value: { transaction: () => tx } })
  return { getRequest, putRequest, tx, store }
}
function success(request: IDBRequest, value?: unknown) {
  Object.defineProperty(request, 'result', { configurable: true, value })
  request.onsuccess?.(new Event('success'))
}

test.each(['update', 'delete'] as const)('%s waits for the transaction commit and reports an abort after request success', async operation => {
  const { tx, getRequest, putRequest } = database()
  let settled = false
  const result = operation === 'update' ? offlineStorage.update('sync_queue', 'q1', { status: 'pending' }) : offlineStorage.delete('sync_queue', 'q1')
  result.then(() => { settled = true }, () => { settled = true })
  if (operation === 'update') success(getRequest, { id: 'q1' })
  success(putRequest)
  await Promise.resolve()
  expect(settled).toBe(false)
  const assertion = expect(result).rejects.toThrow('aborted')
  Object.defineProperty(tx, 'error', { value: new Error('Storage transaction aborted') })
  tx.onabort?.(new Event('abort'))
  await assertion
})

test('one queue read holds at most twenty due records, skipping delayed records without loading the full job', async () => {
  const { tx, store } = database()
  const cursorRequest = {} as IDBRequest<IDBCursorWithValue | null>
  const cursor = { value: null as SyncQueueItem | null, continue: jest.fn() }
  Object.assign(store, { index: () => ({ openCursor: () => cursorRequest }) })
  const promise = offlineStorage.getPendingSyncItems('owner')
  const row: SyncQueueItem = { id: 'q1', recordId: 'p1', type: 'photo', action: 'create', data: { ownerId: 'owner' }, status: 'pending' }
  cursor.value = { ...row, deliveryRetry: { attempts: 1, nextAttemptAt: Date.now() + 60_000, blocked: false } }
  success(cursorRequest, cursor)
  expect(cursor.continue).toHaveBeenCalledTimes(1)
  for (let i = 0; i < 20; i++) {
    cursor.value = { ...row, id: `queue-${i}` }
    success(cursorRequest, cursor)
  }
  expect(cursor.continue).toHaveBeenCalledTimes(20)
  tx.oncomplete?.(new Event('complete'))
  expect(await promise).toHaveLength(20)
  expect(store.get).not.toHaveBeenCalled()
})

test('a persisted pause can only be extended, and is acknowledged only after commit', async () => {
  const { tx, store, getRequest } = database()
  let settled = false
  const promise = offlineStorage.pauseSyncUntil(100)
  await Promise.resolve()
  promise.then(() => { settled = true })
  success(getRequest, { id: 'delivery-pause', until: 500 })
  expect(store.put).toHaveBeenCalledWith({ id: 'delivery-pause', until: 500 })
  await Promise.resolve()
  expect(settled).toBe(false)
  tx.oncomplete?.(new Event('complete'))
  await promise
})

test.each(['syncing', 'failed'] as const)('a %s item cannot be claimed by a second pass', async status => {
  const { tx, store, getRequest } = database()
  jest.spyOn(offlineStorage, 'getSyncPauseUntil').mockResolvedValue(0)
  const promise = offlineStorage.claimSyncItem('q1', 'owner')
  await Promise.resolve()
  success(getRequest, { id: 'q1', status })
  tx.oncomplete?.(new Event('complete'))
  expect(await promise).toBe(false)
  expect(store.put).not.toHaveBeenCalled()
})

test('a shared pause prevents a new queue claim', async () => {
  const { store } = database()
  jest.spyOn(offlineStorage, 'getSyncPauseUntil').mockResolvedValue(Date.now() + 60_000)
  expect(await offlineStorage.claimSyncItem('q1', 'owner')).toBe(false)
  expect(store.get).not.toHaveBeenCalled()
})

test('project device reads return only the active owner’s records and never adopt legacy rows', async () => {
  const owner = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const base = { projectId: 'project', pointName: 'P1', observationType: 'manual' as const }
  jest.spyOn(offlineStorage, 'getAll').mockResolvedValue([
    { ...base, id: 'owned', ownerId: owner }, { ...base, id: 'other', ownerId: other }, { ...base, id: 'legacy' },
  ])
  const read = offlineStorage.getFieldObservations.bind(offlineStorage) as (projectId: string, ownerId?: string) => Promise<FieldObservation[]>
  expect((await read('project', owner)).map(row => row.id)).toEqual(['owned'])
  expect(await read('project')).toEqual([])
})

test('review queues the exact unattributed source only after its transaction commits', async () => {
  const { tx, queueStore: store, queueRead: getRequest, sourceRead, sourceStore } = recoveryDatabase()
  const row: SyncQueueItem = { id: 'legacy', recordId: 'old-source', type: 'field_observation', action: 'create', status: 'failed',
    data: { id: 'old-source', projectId: 'project', pointName: 'P0', observationType: 'manual', timestamp: Date.parse('2026-10-20T08:00:00Z'), easting: 0, northing: 10 } }
  jest.spyOn(offlineStorage, 'get').mockResolvedValue(row)
  const hash = await legacySourceHash(row)
  const promise = offlineStorage.queueLegacyReview('legacy', 'reviewer', 'project', hash)
  const assertion = expect(promise).resolves.toBeUndefined()
  // Hashing completes outside the native transaction; wait for its queued read.
  for (let i = 0; i < 20 && !getRequest.onsuccess; i++) await new Promise(resolve => setTimeout(resolve, 0))
  success(getRequest, row)
  success(sourceRead, { ...(row.data as Record<string, unknown>), synced: false })
  tx.oncomplete?.(new Event('complete'))
  await assertion
  const saved = store.put.mock.calls[0][0] as SyncQueueItem
  expect(saved.status).toBe('pending')
  expect(saved.data).toEqual(row.data)
  expect(saved.recoveryReview).toMatchObject({ sourceHash: hash, actorId: 'reviewer', capturedBy: null })
  expect(row.data).not.toHaveProperty('ownerId')
  expect(sourceStore.add).not.toHaveBeenCalled()
})

test('legacy inventory skips attributed and unrelated projects and returns a bounded metadata page', async () => {
  const { tx, store } = database()
  const request = {} as IDBRequest<IDBCursorWithValue | null>
  const cursor = { key: '', value: null as SyncQueueItem | null, continue: jest.fn() }
  Object.assign(store, { openCursor: () => request })
  const promise = offlineStorage.getLegacyQueuePage('project', 'reviewer')
  for (let i = 0; i < 12; i++) {
    cursor.key = `q-${i}`
    cursor.value = { id: cursor.key, recordId: `p-${i}`, type: 'photo', action: 'create', data: { projectId: 'project', data: 'original-photo-bytes', pointName: `P${i}` } }
    success(request, cursor)
  }
  tx.oncomplete?.(new Event('complete'))
  const result = await promise
  expect(result.items).toHaveLength(10)
  expect(result.next).toBe('q-9')
  expect(result.items[0]).not.toHaveProperty('data')
  expect(store.put).not.toHaveBeenCalled()
})

function recoveryDatabase() {
  const queueRead = {} as IDBRequest
  const sourceRead = {} as IDBRequest
  const queueStore = { get: jest.fn(() => queueRead), put: jest.fn((_value: unknown) => ({} as IDBRequest)) }
  const sourceStore = { get: jest.fn(() => sourceRead), add: jest.fn((_value: unknown) => ({} as IDBRequest)) }
  const tx = { objectStore: jest.fn((name: string) => name === 'sync_queue' ? queueStore : sourceStore), abort: jest.fn(), error: null } as unknown as IDBTransaction
  const transaction = jest.fn(() => tx)
  Object.defineProperty(offlineStorage, 'db', { configurable: true, writable: true, value: { transaction } })
  return { tx, transaction, queueRead, sourceRead, queueStore, sourceStore }
}
const legacyRow: SyncQueueItem = { id: 'retained-queue', recordId: 'retained-source', type: 'field_observation', action: 'create', status: 'failed',
  data: { id: 'retained-source', projectId: 'project', pointName: 'P0', observationType: 'manual', timestamp: Date.parse('2026-10-20T08:00:00Z'),
    easting: 0, northing: 10, rawForm: { bearing: '045.0000', futureField: 'retain exactly' } } }

async function beginLegacyReview() {
  const db = recoveryDatabase()
  jest.spyOn(offlineStorage, 'get').mockResolvedValue(legacyRow)
  const hash = await legacySourceHash(legacyRow)
  const promise = offlineStorage.queueLegacyReview('retained-queue', 'reviewer', 'project', hash)
  // Hashing must finish before opening the native transaction.
  for (let i = 0; i < 20 && !db.queueRead.onsuccess; i++) await new Promise(resolve => setTimeout(resolve, 0))
  success(db.queueRead, legacyRow)
  return { ...db, promise }
}

test('review restores a missing primary device source from the exact queued payload in the same transaction', async () => {
  const db = await beginLegacyReview()
  success(db.sourceRead, undefined)
  expect(db.transaction).toHaveBeenCalledWith(['sync_queue', 'field_observations'], 'readwrite')
  expect(db.sourceStore.add).toHaveBeenCalledWith(legacyRow.data)
  expect(db.queueStore.put).toHaveBeenCalledTimes(1)
  db.tx.oncomplete?.(new Event('complete'))
  await db.promise
})

test.each([
  { easting: 99 }, { ownerId: 'another-owner' }, { rawForm: { bearing: 'different original text' } }, { projectId: 'other-project' },
])('review preserves conflicting queue and primary sources: %j', async changed => {
  const db = await beginLegacyReview()
  const assertion = expect(db.promise).rejects.toThrow(/conflict|differ/i)
  success(db.sourceRead, { ...(legacyRow.data as Record<string, unknown>), ...changed })
  // Completing a read-only rejection must never acknowledge the review.
  db.tx.oncomplete?.(new Event('complete'))
  await assertion
  expect(db.queueStore.put).not.toHaveBeenCalled()
  expect(db.sourceStore.add).not.toHaveBeenCalled()
})

test('an aborted recovery transaction never reports a saved review or reconstructed source', async () => {
  const db = await beginLegacyReview()
  const assertion = expect(db.promise).rejects.toThrow(/cancelled|aborted/i)
  success(db.sourceRead, undefined)
  db.tx.onabort?.(new Event('abort'))
  await assertion
})

test('a delivery receipt cannot mark a changed device source as synced', async () => {
  const { tx, store, getRequest } = database()
  const expected = legacyRow.data as FieldObservation & { id: string; timestamp: number }
  const result = offlineStorage.update('field_observations', expected.id, { synced: true }, expected)
  const assertion = expect(result).rejects.toThrow(/changed|differ|conflict/i)
  success(getRequest, { ...expected, easting: 99 })
  tx.oncomplete?.(new Event('complete'))
  await assertion
  expect(store.put).not.toHaveBeenCalled()
})

test.each(['complete', 'abort'] as const)('matching source acknowledgement waits for transaction %s', async outcome => {
  const { tx, store, getRequest } = database()
  const expected = legacyRow.data as FieldObservation & { id: string; timestamp: number }
  let settled = false
  const result = offlineStorage.update('field_observations', expected.id, { synced: true }, expected)
  void result.then(() => { settled = true }, () => { settled = true })
  // Delivery metadata does not alter the retained raw-source identity.
  success(getRequest, { ...expected, synced: false, deliveryReceipt: { previous: 'metadata only' } })
  await Promise.resolve()
  expect(settled).toBe(false)
  const saved = store.put.mock.calls[0][0] as FieldObservation
  expect(saved.rawForm).toEqual(expected.rawForm)
  expect(saved.easting).toBe(0)
  expect(saved.synced).toBe(true)
  if (outcome === 'complete') {
    tx.oncomplete?.(new Event('complete'))
    await result
  } else {
    const assertion = expect(result).rejects.toThrow(/aborted/i)
    tx.onabort?.(new Event('abort'))
    await assertion
  }
})

test.each([
  { data: { ...(legacyRow.data as Record<string, unknown>), northing: 999 } },
  { recordId: 'replacement-record' }, { ownerId: 'different-owner' },
])('a late response cannot remove a changed queue source: %j', async changed => {
  const { tx, store, getRequest } = database()
  const result = Reflect.apply(offlineStorage.removeFromSyncQueue, offlineStorage, [legacyRow.id, legacyRow]) as Promise<void>
  const assertion = expect(result).rejects.toThrow(/changed|differ|conflict/i)
  success(getRequest, { ...legacyRow, ...changed, status: 'syncing' })
  tx.oncomplete?.(new Event('complete'))
  await assertion
  expect(store.delete).not.toHaveBeenCalled()
})

test('matching queue removal ignores transport state but waits for transaction commit', async () => {
  const { tx, store, getRequest, putRequest } = database()
  let settled = false
  const result = Reflect.apply(offlineStorage.removeFromSyncQueue, offlineStorage, [legacyRow.id, legacyRow]) as Promise<void>
  void result.then(() => { settled = true })
  success(getRequest, { ...legacyRow, status: 'syncing', lastAttempt: Date.now(), retryCount: 3 })
  success(putRequest)
  await Promise.resolve()
  expect(settled).toBe(false)
  tx.oncomplete?.(new Event('complete'))
  await result
  expect(store.delete).toHaveBeenCalledWith(legacyRow.id)
})
