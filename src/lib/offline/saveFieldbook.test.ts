import type { BrowserClient } from '@/lib/api-client/client'
import { persistFieldbook } from './saveFieldbook'
import { stageFieldbookSave } from './fieldbooks'
import { removeSyncedOperation } from './syncQueue'

jest.mock('./fieldbooks', () => ({ stageFieldbookSave: jest.fn() }))
jest.mock('./syncQueue', () => ({ removeSyncedOperation: jest.fn() }))

const stage = jest.mocked(stageFieldbookSave)
const remove = jest.mocked(removeSyncedOperation)
const single = jest.fn()
const upsert = jest.fn(() => ({ select: () => ({ single }) }))
const from = jest.fn(() => ({ upsert }))
const getSession = jest.fn(async () => ({ data: { session: { user: { id: 'owner' } } } }))
const client = { from, auth: { getSession } } as unknown as BrowserClient
const book = { id: 'book', project_id: 'project', user_id: 'owner', data: { rows: [{ bs: '1.23' }] } }

beforeEach(() => { jest.clearAllMocks(); stage.mockResolvedValue(17); single.mockResolvedValue({ data: { id: 'book' }, error: null }) })
it('saves and queues before attempting a network write', async () => {
  expect(await persistFieldbook(client, book, true)).toMatchObject({ pending: false })
  expect(stage).toHaveBeenCalledWith(book)
  expect(stage.mock.invocationCallOrder[0]).toBeLessThan(upsert.mock.invocationCallOrder[0])
  expect(remove).toHaveBeenCalledWith(17)
})
it('keeps the durable operation when offline', async () => {
  expect(await persistFieldbook(client, book, false)).toMatchObject({ pending: true })
  expect(from).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})
it.each([
  { data: null, error: { message: 'Network error' } },
  { data: null, error: null },
  { data: { id: 'another-book' }, error: null },
])('keeps the operation without an acknowledgement: %p', async (response) => {
  single.mockResolvedValueOnce(response)
  expect(await persistFieldbook(client, book, true)).toMatchObject({ pending: true })
  expect(remove).not.toHaveBeenCalled()
})
it('does not attempt a write when device storage fails', async () => {
  stage.mockRejectedValueOnce(new Error('Storage full'))
  await expect(persistFieldbook(client, book, true)).rejects.toThrow('Storage full')
  expect(from).not.toHaveBeenCalled()
})
it('does not send another account’s cached observations', async () => {
  getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'other-owner' } } } })
  expect(await persistFieldbook(client, book, true)).toMatchObject({ pending: true })
  expect(from).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})
