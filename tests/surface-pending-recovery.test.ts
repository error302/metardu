import { acknowledgePending, preparePending, readPending, type PendingStorage } from '@/lib/topo/surfacePending'
import { surfaceRequestSchema } from '@/lib/topo/surfaceRequest'
const OWNER = '11111111-1111-4111-8111-111111111111', PROJECT = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333', FIRST = '44444444-4444-4444-8444-444444444444', SECOND = '55555555-5555-4555-8555-555555555555'
const body = (requestId = FIRST) => surfaceRequestSchema.parse({ requestId, expectedUserId: OWNER, pointIds: [OWNER, PROJECT, OTHER], expectedReferenceHash: 'a'.repeat(64), expectedSourceHash: 'b'.repeat(64), useStoredBreaklines: false })
let values: Map<string, string>, storage: PendingStorage
const lock = async <T,>(_key: string, work: () => T | Promise<T>) => work()
beforeEach(() => { values = new Map(); storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } } })
test('a prepared request survives a new page instance with the same exact wire identity', async () => {
  const pending = await preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)
  expect(readPending(OWNER, PROJECT, storage)).toEqual(pending)
  const again = await preparePending(OWNER, PROJECT, 'surface', body(SECOND), storage, lock)
  expect(again.body.requestId).toBe(FIRST)
  expect(values.size).toBe(1)
})
test('another account/project cannot see the retained request', async () => {
  await preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)
  expect(readPending(OTHER, PROJECT, storage)).toBeNull()
  expect(readPending(OWNER, OTHER, storage)).toBeNull()
})
test('an unresolved different intent cannot overwrite the earlier request', async () => {
  const pending = await preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)
  await expect(preparePending(OWNER, PROJECT, 'surface', { ...body(SECOND), interval: 2 }, storage, lock)).rejects.toThrow('unconfirmed')
  expect(readPending(OWNER, PROJECT, storage)).toEqual(pending)
})
test('acknowledging an old request cannot remove a newer pending request', async () => {
  const pending = await preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)
  expect(await acknowledgePending(pending, storage, lock)).toBe(true)
  const next = await preparePending(OWNER, PROJECT, 'surface', body(SECOND), storage, lock)
  expect(await acknowledgePending(pending, storage, lock)).toBe(false)
  expect(readPending(OWNER, PROJECT, storage)).toEqual(next)
})
test('quota/readback failure refuses preparation without pretending a durable request exists', async () => {
  storage.setItem = () => { throw new Error('quota') }
  await expect(preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)).rejects.toThrow('quota')
  expect(values.size).toBe(0)
})
test('corrupt or wrong-scope records are preserved and refused', async () => {
  await preparePending(OWNER, PROJECT, 'surface', body(), storage, lock)
  const key = [...values.keys()][0]; values.set(key, '{bad')
  expect(() => readPending(OWNER, PROJECT, storage)).toThrow('recovery record')
  expect(values.get(key)).toBe('{bad')
})
