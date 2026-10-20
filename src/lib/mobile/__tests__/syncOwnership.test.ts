/** @jest-environment node */
import { offlineStorage, type SyncQueueItem } from '../offlineStorage'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'

jest.mock('../offlineStorage', () => ({ MOBILE_SYNC_BATCH_SIZE: 20, isSyncItemOwnedBy: jest.requireActual<typeof import('../offlineStorage')>('../offlineStorage').isSyncItemOwnedBy, offlineStorage: {
  getSyncPauseUntil: jest.fn().mockResolvedValue(0), pauseSyncUntil: jest.fn(), recoverStaleSyncItems: jest.fn(),
  getPendingSyncItems: jest.fn(), retryFailedSyncItems: jest.fn(), claimSyncItem: jest.fn().mockResolvedValue(true),
  updateSyncStatus: jest.fn(), removeFromSyncQueue: jest.fn(), update: jest.fn(),
} }))

const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222'
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalFetch = global.fetch
let service: typeof import('../syncService')['syncService']
let actor: string | null
beforeAll(async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  service = (await import('../syncService')).syncService
})
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
  else Reflect.deleteProperty(globalThis, 'navigator')
  global.fetch = originalFetch
})
function row(id: string, ownerId?: string): SyncQueueItem {
  return { id, type: 'field_observation', action: 'create', recordId: id, status: 'pending',
    data: { id, ownerId, projectId: '33333333-3333-4333-8333-333333333333', pointName: id,
      observationType: 'manual', timestamp: Date.parse('2026-10-20T08:00:00Z'), easting: 0, northing: 10 } }
}
beforeEach(() => {
  jest.clearAllMocks()
  actor = bob
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([row('alice-reading', alice), row('bob-reading', bob), row('legacy-reading')])
  global.fetch = jest.fn(async (url, init) => {
    if (url === '/api/auth/session') return new Response(JSON.stringify(actor ? { user: { id: actor } } : {}), { status: 200 })
    const capture = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ ok: true, id: capture.id, observationId: alice, batchId: bob,
      inputHash: await observationDeliveryHash(capture), fieldVerified: false, replayed: false }), { status: 201 })
  })
})

test('another account cannot drain or alter previous-owner and unattributed device work', async () => {
  await expect(service.forceSync()).resolves.toEqual({ synced: 1, failed: 0 })
  const deliveries = jest.mocked(fetch).mock.calls.filter(([url]) => url === '/api/fieldbook/sync')
  expect(deliveries).toHaveLength(1)
  expect(JSON.parse(String(deliveries[0][1]?.body))).toMatchObject({ id: 'bob-reading', ownerId: bob })
  expect(offlineStorage.claimSyncItem).toHaveBeenCalledTimes(1)
  expect(offlineStorage.removeFromSyncQueue).toHaveBeenCalledWith('bob-reading')
  expect(offlineStorage.retryFailedSyncItems).toHaveBeenCalledWith(bob)
})

test('no confirmed session leaves the whole queue untouched', async () => {
  actor = null
  await expect(service.forceSync()).resolves.toEqual({ synced: 0, failed: 0 })
  expect(offlineStorage.getPendingSyncItems).not.toHaveBeenCalled()
  expect(offlineStorage.retryFailedSyncItems).not.toHaveBeenCalled()
  expect(offlineStorage.claimSyncItem).not.toHaveBeenCalled()
  expect(service.getSyncStatus().message).toMatch(/sign in/i)
})

test('each pass uses the current authenticated account rather than remembering the last uploader', async () => {
  await service.syncPending()
  actor = alice
  jest.mocked(offlineStorage.removeFromSyncQueue).mockClear()
  await service.syncPending()
  expect(offlineStorage.removeFromSyncQueue).toHaveBeenCalledTimes(1)
  expect(offlineStorage.removeFromSyncQueue).toHaveBeenCalledWith('alice-reading')
})

test('explicit legacy review can deliver without inventing a capture owner or changing raw input identity', async () => {
  const legacy = row('legacy-reviewed')
  const data = legacy.data as Record<string, unknown>
  const capture = { ...data, surveyType: 'unspecified', station: data.pointName, pointId: data.pointName, createdAt: new Date(Number(data.timestamp)).toISOString() }
  const sourceHash = await observationDeliveryHash(capture)
  const reviewed = { ...legacy, recoveryReview: { version: 'unknown-author-v1' as const, actorId: bob, projectId: String(data.projectId),
    sourceHash, reviewedAt: '2026-10-20T08:00:00.000Z', capturedBy: null } }
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([reviewed])
  jest.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === '/api/auth/session') return new Response(JSON.stringify({ user: { id: bob } }))
    const body = JSON.parse(String(init?.body)) as { capture: Record<string, unknown> }
    return new Response(JSON.stringify({ ok: true, id: body.capture.id, observationId: alice, batchId: bob,
      inputHash: await observationDeliveryHash(body.capture), fieldVerified: false, replayed: false,
      legacyRecoveryReview: { version: 'unknown-author-v1', reviewedBy: bob, sourceHash, reviewedAt: '2026-10-20T08:00:00.000Z', capturedBy: null } }), { status: 201 })
  })
  await expect(service.syncPending()).resolves.toEqual({ synced: 1, failed: 0 })
  const delivery = jest.mocked(fetch).mock.calls.find(([url]) => url === '/api/fieldbook/recovery')
  expect(delivery).toBeDefined()
  expect(JSON.parse(String(delivery?.[1]?.body))).toMatchObject({ acknowledgement: 'unknown-author-v1', sourceHash, capture: { id: 'legacy-reviewed' } })
  expect(data.ownerId).toBeUndefined()
})

test('a legacy acknowledgement without the server review record cannot remove the device source', async () => {
  const legacy = row('legacy-no-review-receipt')
  const data = legacy.data as Record<string, unknown>
  const capture = { ...data, surveyType: 'unspecified', station: data.pointName, pointId: data.pointName, createdAt: new Date(Number(data.timestamp)).toISOString() }
  const sourceHash = await observationDeliveryHash(capture)
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([{ ...legacy, recoveryReview: {
    version: 'unknown-author-v1', actorId: bob, projectId: String(data.projectId), sourceHash, reviewedAt: '2026-10-20T08:00:00.000Z', capturedBy: null,
  } }])
  jest.mocked(fetch).mockImplementation(async url => url === '/api/auth/session' ? new Response(JSON.stringify({ user: { id: bob } })) : new Response(JSON.stringify({
    ok: true, id: data.id, observationId: alice, batchId: bob, inputHash: sourceHash, fieldVerified: false, replayed: false,
  })))
  await expect(service.syncPending()).resolves.toEqual({ synced: 0, failed: 1 })
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled()
})

test('a payload changed after legacy review is held without any delivery request', async () => {
  const legacy = row('legacy-reviewed')
  jest.mocked(offlineStorage.getPendingSyncItems).mockResolvedValue([{ ...legacy, recoveryReview: {
    version: 'unknown-author-v1', actorId: bob, projectId: '33333333-3333-4333-8333-333333333333', sourceHash: '0'.repeat(64),
    reviewedAt: '2026-10-20T08:00:00.000Z', capturedBy: null,
  } } as SyncQueueItem])
  await expect(service.syncPending()).resolves.toEqual({ synced: 0, failed: 1 })
  expect(jest.mocked(fetch).mock.calls.filter(([url]) => url !== '/api/auth/session')).toHaveLength(0)
  expect(offlineStorage.removeFromSyncQueue).not.toHaveBeenCalled()
})
