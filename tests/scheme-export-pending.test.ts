import { createHash } from 'node:crypto'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  readSchemePending,
  prepareSchemePending,
  acknowledgeSchemePending,
  schemePendingHash,
  type SchemePendingStorage,
  type SchemePendingLock,
} from '@/lib/scheme/exportPending'
import {
  schemeExportRequestSchema,
  schemeExportSourceRevision,
  schemeExportIntent,
} from '@/lib/scheme/exportContract'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333'
const body = () =>
  schemeExportRequestSchema.parse({
    expectedUserId: actor,
    projectId: project,
    requestId: '22222222-2222-4222-8222-222222222222',
    parcelIds: ['44444444-4444-4444-8444-444444444444'],
    sourceHash: 'a'.repeat(64),
    reviewed: true,
  })
function device() {
  const data = new Map<string, string>()
  let tail: Promise<unknown> = Promise.resolve()
  const storage: SchemePendingStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
  const lock: SchemePendingLock = (_key, work) => {
    const next = tail.then(work)
    tail = next.catch(() => undefined)
    return next
  }
  return { data, storage, lock }
}
it('persists intent before transmission and reuses its nonce across concurrent tabs', async () => {
  const d = device()
  const [a, b] = await Promise.all([
    prepareSchemePending(body(), 'dxf', d.storage, d.lock),
    prepareSchemePending(
      { ...body(), requestId: '55555555-5555-4555-8555-555555555555' },
      'dxf',
      d.storage,
      d.lock,
    ),
  ])
  expect(a.body.requestId).toBe(b.body.requestId)
  expect(d.data.size).toBe(1)
  expect(readSchemePending(actor, project, d.storage)).toEqual(a)
})
it('preserves conflicting work instead of replacing the original intent', async () => {
  const d = device(),
    saved = await prepareSchemePending(body(), 'dxf', d.storage, d.lock)
  await expect(
    prepareSchemePending(body(), 'geojson', d.storage, d.lock),
  ).rejects.toThrow(/unconfirmed/)
  expect(readSchemePending(actor, project, d.storage)).toEqual(saved)
})
it('refuses transmission when persistence or session locking fails', async () => {
  const d = device()
  d.storage.setItem = () => {}
  await expect(
    prepareSchemePending(body(), 'dxf', d.storage, d.lock),
  ).rejects.toThrow(/acknowledge/)
  await expect(
    prepareSchemePending(body(), 'dxf', d.storage, async () => {
      throw new Error('No session lock')
    }),
  ).rejects.toThrow(/session lock/)
  expect(d.data.size).toBe(0)
})
it('retains corrupted or foreign device records for explicit recovery', async () => {
  const d = device()
  await prepareSchemePending(body(), 'dxf', d.storage, d.lock)
  const [key] = d.data.keys()
  d.data.set(key, 'invalid JSON')
  expect(() => readSchemePending(actor, project, d.storage)).toThrow(
    /preserved/,
  )
  expect(d.data.get(key)).toBe('invalid JSON')
  d.data.set(
    key,
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      format: 'dxf',
      body: { ...body(), expectedUserId: project },
    }),
  )
  expect(() => readSchemePending(actor, project, d.storage)).toThrow(
    /another account/,
  )
})
it('clears only the exact acknowledged record', async () => {
  const d = device(),
    saved = await prepareSchemePending(body(), 'dxf', d.storage, d.lock)
  expect(
    await acknowledgeSchemePending(
      {
        ...saved,
        body: {
          ...saved.body,
          requestId: '55555555-5555-4555-8555-555555555555',
        },
      },
      d.storage,
      d.lock,
    ),
  ).toBe(false)
  expect(await acknowledgeSchemePending(saved, d.storage, d.lock)).toBe(true)
  expect(d.data.size).toBe(0)
})
it('uses the same complete hash identity in browser and register tokens', async () => {
  const d = device(),
    saved = await prepareSchemePending(body(), 'geojson', d.storage, d.lock)
  expect(await schemePendingHash(saved)).toBe(
    createHash('sha256')
      .update(canonicalJSON(schemeExportIntent(saved.body, saved.format)))
      .digest('hex'),
  )
  for (const value of [
    '00'.repeat(32),
    'ff'.repeat(32),
    '0123456789abcdef'.repeat(4),
  ])
    expect(schemeExportSourceRevision(value)).toBe(
      `scheme:${Buffer.from(value, 'hex').toString('base64url')}`,
    )
})
