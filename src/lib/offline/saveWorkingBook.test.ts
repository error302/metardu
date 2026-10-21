/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB } from 'idb'
import { persistWorkingBook } from './saveWorkingBook'
import { listBookEdits } from './bookEdits'
import { saveFieldbookOffline } from './fieldbooks'
jest.mock('./fieldbooks', () => ({ saveFieldbookOffline: jest.fn(async () => {}) }))
const actor = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222'
const record = { id: '33333333-3333-4333-8333-333333333333', user_id: actor, project_id: project, type: 'leveling', name: 'Run', data: { bs: '1.5000' } }
const originalFetch = global.fetch
beforeEach(async () => { await deleteDB('metardu-book-edits'); await deleteDB('metardu-book-delivery-journal'); global.fetch = jest.fn(); jest.clearAllMocks() })
afterEach(() => jest.restoreAllMocks())
afterAll(() => { global.fetch = originalFetch })
test('an offline save retains the raw edit and its explicit creation basis before returning durable success', async () => {
  const result = await persistWorkingBook(actor, record, { kind: 'new' }, false)
  expect(result.pending).toBe(true)
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit: { requestId: result.requestId, data: record.data, basis: { kind: 'new' } } }])
  expect(fetch).not.toHaveBeenCalled()
})
test('server/schema uncertainty keeps the durable snapshot available and never falls back to a generic upsert', async () => {
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Revision service not ready' }), { status: 503 }))
  const result = await persistWorkingBook(actor, record, { kind: 'new' }, true)
  expect(result.pending).toBe(true)
  expect(await listBookEdits(actor, project)).toHaveLength(1)
  expect(jest.mocked(fetch).mock.calls.map(call => call[0])).toEqual(['/api/fieldbook/delivery'])
})
test('an older book without a baseline is retained for review without a network write', async () => {
  expect(await persistWorkingBook(actor, record, { kind: 'unknown' }, true)).toMatchObject({ pending: true })
  expect(fetch).not.toHaveBeenCalled()
  expect(await listBookEdits(actor, project)).toHaveLength(1)
})
test('a cache failure cannot hide the separately retained recovery snapshot', async () => {
  jest.mocked(saveFieldbookOffline).mockRejectedValueOnce(new Error('Cache full'))
  const result = await persistWorkingBook(actor, record, { kind: 'new' }, false)
  expect(result.pending).toBe(true)
  expect(await listBookEdits(actor, project)).toHaveLength(1)
})
test('another account cannot reassign a working record during save', async () => {
  await expect(persistWorkingBook(project, record, { kind: 'new' }, true)).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  expect(await listBookEdits(actor, project)).toEqual([])
})
test('a caller edit during retention cannot label different cached data with the older request id', async () => {
  const mutable = structuredClone(record)
  const saving = persistWorkingBook(actor, mutable, { kind: 'new' }, false)
  mutable.data.bs = '9.9999'
  await saving
  expect(jest.mocked(saveFieldbookOffline).mock.calls[0][0]).toMatchObject({ data: { bs: '1.5000' } })
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit: { data: { bs: '1.5000' } } }])
})

test.each([409, 503])('automatic saves retain raw edits but do not repeatedly send after HTTP %s', async status => {
  const id = '44444444-4444-4444-8444-444444444444'
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status }))
  expect(await persistWorkingBook(actor, record, { kind: 'new' }, true, id)).toMatchObject({ pending: true })
  expect(await persistWorkingBook(actor, record, { kind: 'new' }, true, id)).toMatchObject({ pending: true })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit: { requestId: id, data: { bs: '1.5000' } }, result: null }])
})

test('automatic server failures back off across reopened journal connections without losing precision strings', async () => {
  let now = 1700000000000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  const id = '44444444-4444-4444-8444-444444444444'
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }))
  await persistWorkingBook(actor, record, { kind: 'new' }, true, id)
  now += 30000
  await persistWorkingBook(actor, record, { kind: 'new' }, true, id)
  expect(fetch).toHaveBeenCalledTimes(2)
  now += 30000
  await persistWorkingBook(actor, record, { kind: 'new' }, true, id)
  expect(fetch).toHaveBeenCalledTimes(2)
  now += 30000
  await persistWorkingBook(actor, record, { kind: 'new' }, true, id)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(await listBookEdits(actor, project)).toMatchObject([{ edit: { requestId: id, data: { bs: '1.5000' } }, result: null }])
})

test('authentication loss pauses automatic delivery across new requests until explicit recovery', async () => {
  const id = '44444444-4444-4444-8444-444444444444'
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }))
  await persistWorkingBook(actor, record, { kind: 'new' }, true, id)
  await persistWorkingBook(actor, { ...record, id: project }, { kind: 'new' }, true, '55555555-5555-4555-8555-555555555555')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await listBookEdits(actor, project)).toHaveLength(2)
})
