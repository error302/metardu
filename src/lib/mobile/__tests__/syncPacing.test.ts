/** @jest-environment node */
let syncService: typeof import('../syncService')['syncService']
import { offlineStorage, type SyncQueueItem } from '../offlineStorage'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'
import type { FieldDeliveryRetry } from '@/lib/field/deliveryRetry'

jest.mock('../offlineStorage', () => ({ MOBILE_SYNC_BATCH_SIZE: 20, isSyncItemOwnedBy: jest.requireActual<typeof import('../offlineStorage')>('../offlineStorage').isSyncItemOwnedBy, offlineStorage: {
  recoverStaleSyncItems: jest.fn(), getPendingSyncItems: jest.fn(), retryFailedSyncItems: jest.fn(),
  updateSyncStatus: jest.fn(), removeFromSyncQueue: jest.fn(), update: jest.fn(),
  getSyncPauseUntil: jest.fn(), pauseSyncUntil: jest.fn(), claimSyncItem: jest.fn(),
} }))
jest.mock('@/lib/api-client/client', () => ({ createClient: jest.fn(() => ({ auth: { getSession: async () => ({ data: { session: { user: { id: '11111111-1111-4111-8111-111111111111' } } }, error: null }) } })) }))

const storage = offlineStorage as typeof offlineStorage & {
  getSyncPauseUntil: jest.Mock<Promise<number>, []>
  pauseSyncUntil: jest.Mock<Promise<void>, [number]>
  claimSyncItem: jest.Mock<Promise<boolean>, [string]>
}
let queue: SyncQueueItem[]
let pauseUntil: number
let now: number
const originalFetch = global.fetch
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
beforeAll(async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  ;({ syncService } = await import('../syncService'))
})
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else Reflect.deleteProperty(globalThis, 'navigator')
})

function item(index: number): SyncQueueItem {
  return { id: `queue-${index}`, recordId: `capture-${index}`, type: 'field_observation', action: 'create', status: 'pending',
    data: { id: `capture-${index}`, ownerId: '11111111-1111-4111-8111-111111111111', projectId: `project-${index % 2}`, pointName: `P${index}`, observationType: 'manual',
      easting: 0, northing: 10, elevation: 0, timestamp: Date.parse('2026-10-20T08:00:00Z') } }
}

beforeEach(() => {
  jest.clearAllMocks()
  now = 1_000_000
  pauseUntil = 0
  queue = [item(0), item(1)]
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.mocked(offlineStorage.getPendingSyncItems).mockImplementation(async () => queue.filter(row => row.status === 'pending'))
  storage.getSyncPauseUntil.mockImplementation(async () => pauseUntil)
  storage.pauseSyncUntil.mockImplementation(async until => { pauseUntil = Math.max(until, pauseUntil) })
  storage.claimSyncItem.mockResolvedValue(true)
  jest.mocked(offlineStorage.updateSyncStatus).mockImplementation(async (id, status, error, retryCount, retry?: FieldDeliveryRetry) => {
    const row = queue.find(entry => entry.id === id)
    if (row) Object.assign(row, { status, error, retryCount, deliveryRetry: retry })
  })
  jest.mocked(offlineStorage.removeFromSyncQueue).mockImplementation(async id => { queue = queue.filter(row => row.id !== id) })
  global.fetch = jest.fn(async (_url, init) => {
    const capture = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ ok: true, id: capture.id, observationId: '11111111-1111-4111-8111-111111111111',
      batchId: '22222222-2222-4222-8222-222222222222', inputHash: await observationDeliveryHash(capture), fieldVerified: false, replayed: false }), { status: 201 })
  })
})
afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch })

test('a large mobile queue delivers at most twenty exact receipts per pass', async () => {
  queue = Array.from({ length: 25 }, (_, index) => item(index))
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 20, failed: 0 })
  expect(fetch).toHaveBeenCalledTimes(20)
  expect(queue.map(row => row.id)).toEqual(['queue-20', 'queue-21', 'queue-22', 'queue-23', 'queue-24'])
})

test('an interrupted connection stops the pass and persists a delay across repeated and manual attempts', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('Connection interrupted'))
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 0, failed: 1 })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(pauseUntil).toBe(now + 30_000)
  await syncService.syncPending()
  await syncService.forceSync()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(queue).toHaveLength(2)
  now += 30_001
  await syncService.syncPending()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(pauseUntil).toBe(now + 60_000)
})

test.each([429, 503])('HTTP %s retains Retry-After even for non-JSON failures and stops other projects', async status => {
  jest.mocked(fetch).mockResolvedValue(new Response('Try later', { status, headers: { 'Retry-After': '120' } }))
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 0, failed: 1 })
  expect(pauseUntil).toBe(now + 120_000)
  await syncService.forceSync()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(offlineStorage.retryFailedSyncItems).not.toHaveBeenCalled()
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled()
})

test('a rejected observation is held for review while unrelated records can deliver', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Capture conflict' }), { status: 409 }))
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 1, failed: 1 })
  expect(queue).toHaveLength(1)
  expect(queue[0]).toMatchObject({ id: 'queue-0', status: 'failed', deliveryRetry: { blocked: true, httpStatus: 409 } })
  await syncService.syncPending()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('an invalid success receipt is held for review rather than automatically delivered again', async () => {
  queue = [item(0)]
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 0, failed: 1 })
  expect(queue[0].status).toBe('failed')
  await syncService.syncPending()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a record already claimed in another tab is not delivered or removed', async () => {
  storage.claimSyncItem.mockResolvedValue(false)
  await expect(syncService.syncPending()).resolves.toEqual({ synced: 0, failed: 0 })
  expect(fetch).not.toHaveBeenCalled()
  expect(queue).toHaveLength(2)
})
