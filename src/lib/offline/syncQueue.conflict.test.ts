import { createClient } from '@/lib/api-client/client'
import { syncPendingOperations, type SyncOperation } from './syncQueue'

const mockGetAll = jest.fn<Promise<SyncOperation[]>, [string]>()
const mockDelete = jest.fn<Promise<void>, [string, number]>(async () => {})
const mockPut = jest.fn<Promise<void>, [string, SyncOperation]>(async () => {})
jest.mock('idb', () => ({ openDB: jest.fn(async () => ({
  getAll: (table: string) => mockGetAll(table),
  delete: (table: string, id: number) => mockDelete(table, id),
  put: (table: string, op: SyncOperation) => mockPut(table, op),
})) }))

const originalFetch = global.fetch
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
const op: SyncOperation = {
  id: 9, type: 'UPSERT', table: 'observations', projectId: 'parcel-1', retries: 0, priority: 'normal',
  timestamp: '2026-11-17T06:00:00Z',
  data: { id: 'obs-1', project_id: 'parcel-1', updated_at: '2026-11-17T06:00:00Z', residual_m: 0.011 },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAll.mockResolvedValue([{ ...op, data: { ...op.data } }])
  global.fetch = fetchMock
})
afterAll(() => { global.fetch = originalFetch })

/** Every write the queue sends to the server, so "did it overwrite?" is observable. */
function serverWrites() {
  return fetchMock.mock.calls
    .filter(call => call[0] === '/api/db')
    .map(call => JSON.parse(String(call[1]?.body)) as { operation: string })
    .filter(body => body.operation !== 'select')
}

it('keeps a newer server record untouched when there is nobody to ask', async () => {
  fetchMock.mockImplementation(async (url, init) => ({
    ok: true,
    json: async () => {
      const request = JSON.parse(String(init?.body)) as { operation: string }
      return request.operation === 'select'
        ? { data: { id: 'obs-1', updated_at: '2026-11-17T07:30:00Z' }, error: null }
        : { data: { id: 'obs-1' }, error: null }
    },
  } as Response))

  const result = await syncPendingOperations(createClient())

  expect(serverWrites()).toEqual([])
  expect(mockDelete).not.toHaveBeenCalled()
  expect(result).toMatchObject({ synced: 0, failed: 0, conflicts: 1 })
  expect(result.unresolved).toEqual([
    { table: 'observations', recordId: 'obs-1', projectId: 'parcel-1', localTimestamp: '2026-11-17T06:00:00Z' },
  ])
})

it('still syncs records the server has not touched since this device edited them', async () => {
  fetchMock.mockImplementation(async (url, init) => ({
    ok: true,
    json: async () => {
      const request = JSON.parse(String(init?.body)) as { operation: string }
      return request.operation === 'select'
        // Same timestamp the device holds: no conflict, so normal syncing applies.
        ? { data: { id: 'obs-1', updated_at: '2026-11-17T06:00:00Z' }, error: null }
        : { data: { id: 'obs-1' }, error: null }
    },
  } as Response))

  const result = await syncPendingOperations(createClient())

  // The guard must not turn ordinary syncing into a permanent stall.
  expect(result.unresolved).toEqual([])
})
