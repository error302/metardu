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
const op: SyncOperation = { id: 5, type: 'UPSERT', table: 'fieldbooks', projectId: 'road', retries: 0, priority: 'normal', timestamp: '2026-10-18T09:00:00Z',
  data: { id: 'book', user_id: 'owner', project_id: 'road', updated_at: '2026-10-18T09:00:00Z', data: { rows: [] } } }
let owner = 'owner'
let remote: { data: Record<string, unknown> | null; error: { message: string; code: string } | null }
let acknowledgedId = 'book'

beforeEach(() => {
  jest.clearAllMocks(); owner = 'owner'; acknowledgedId = 'book'
  mockGetAll.mockResolvedValue([{ ...op, data: { ...op.data } }])
  remote = { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
  fetchMock.mockImplementation(async (url, init) => ({ ok: true, json: async () => {
    if (url === '/api/auth/session') return { user: { id: owner } }
    const request = JSON.parse(String(init?.body)) as { operation: string }
    return request.operation === 'select' ? remote : { data: { id: acknowledgedId }, error: null }
  } } as Response))
  global.fetch = fetchMock
})
afterAll(() => { global.fetch = originalFetch })

it('retains legacy book operations for review instead of replaying unversioned upserts', async () => {
  expect(await syncPendingOperations(createClient())).toMatchObject({ synced: 0, failed: 1 })
  const bodies = fetchMock.mock.calls.filter(call => call[0] === '/api/db').map(call => JSON.parse(String(call[1]?.body)) as { operation: string; payload: unknown })
  expect(bodies).toEqual([])
  expect(mockDelete).not.toHaveBeenCalled()
})
it('does not send a different account’s cached book', async () => {
  owner = 'someone-else'
  expect(await syncPendingOperations(createClient())).toMatchObject({ synced: 0, failed: 1 })
  expect(fetchMock.mock.calls.filter(call => call[0] === '/api/db')).toHaveLength(0)
  expect(mockDelete).not.toHaveBeenCalled()
})
it('retains the operation if server confirmation has a different book ID', async () => {
  acknowledgedId = 'different'
  expect(await syncPendingOperations(createClient())).toMatchObject({ synced: 0, failed: 1 })
  expect(mockDelete).not.toHaveBeenCalled()
})
it('keeps a newer remote book untouched without a conflict resolution', async () => {
  remote = { data: { id: 'book', updated_at: '2026-10-18T10:00:00Z' }, error: null }
  expect(await syncPendingOperations(createClient())).toMatchObject({ synced: 0, failed: 1 })
  expect(fetchMock.mock.calls.filter(call => call[0] === '/api/db')).toHaveLength(0)
  expect(mockDelete).not.toHaveBeenCalled()
})
it('does not overwrite when the remote version cannot be checked', async () => {
  remote = { data: null, error: { message: 'Connection lost', code: 'FETCH_ERROR' } }
  expect(await syncPendingOperations(createClient())).toMatchObject({ synced: 0, failed: 1 })
  expect(fetchMock.mock.calls.filter(call => call[0] === '/api/db')).toHaveLength(0)
  expect(mockDelete).not.toHaveBeenCalled()
})
