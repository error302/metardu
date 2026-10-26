/** @jest-environment node */
import { webcrypto } from 'node:crypto'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
} from '../roadWorkbenchDraft'
import {
  readRoadRecovery,
  writeRoadRecovery,
  clearRoadRecovery,
  roadRecoveryKey,
  type RoadRecoveryRecord,
} from '../roadWorkbenchRecoveryDevice'
import { roadRequestDigest } from '../roadWorkbenchRecoveryContract'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '22222222-2222-4222-8222-222222222222'
const entry = '33333333-3333-4333-8333-333333333333'
const lock = async <T>(_key: string, work: () => T | Promise<T>) => work()
const rows = new Map<string, string>()
const storage = {
  getItem: (key: string) => rows.get(key) ?? null,
  setItem: (key: string, value: string) => {
    rows.set(key, value)
  },
  removeItem: (key: string) => {
    rows.delete(key)
  },
}
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
})
beforeEach(() => rows.clear())
function record(): RoadRecoveryRecord {
  const e = roadWorkbenchExample(),
    source = {
      version: 1 as const,
      actorId: actor,
      projectId: project,
      engineeringHash: 'a'.repeat(64),
      referenceHash: 'b'.repeat(64),
      ...e,
    }
  const draft = createRoadWorkbenchDraft(e.road)
  draft.ips[0].easting = ''
  return {
    version: 1,
    actorId: actor,
    projectId: project,
    entryId: entry,
    sequence: 1,
    source,
    draft,
    command: null,
    updatedAt: '2026-10-27T00:00:00.000Z',
  }
}
it('retains incomplete text and the exact original source across reconstruction of the editor', async () => {
  const r = record(),
    saved = await writeRoadRecovery(r, null, storage, lock)
  const loaded = await readRoadRecovery(actor, project, storage)
  expect(loaded?.record.draft.ips[0].easting).toBe('')
  expect(loaded?.digest).toBe(saved.digest)
  expect(loaded?.record.source.road.stations).toEqual(r.source.road.stations)
  expect(
    await readRoadRecovery(
      '55555555-5555-4555-8555-555555555555',
      project,
      storage,
    ),
  ).toBeNull()
})
it('compares the retained device version under a lock so another tab cannot replace newer edits', async () => {
  const r = record(),
    first = await writeRoadRecovery(r, null, storage, lock)
  const second = await writeRoadRecovery(
    { ...r, sequence: 2, draft: { ...r.draft, startChainage: '10' } },
    first.digest,
    storage,
    lock,
  )
  await expect(
    writeRoadRecovery({ ...r, sequence: 3 }, first.digest, storage, lock),
  ).rejects.toThrow(/another|changed/i)
  expect((await readRoadRecovery(actor, project, storage))?.digest).toBe(
    second.digest,
  )
})
it('preserves a corrupt or cross-account record and refuses a replacement', async () => {
  const r = record()
  await writeRoadRecovery(r, null, storage, lock)
  const key = roadRecoveryKey(actor, project),
    raw = storage.getItem(key)
  if (raw === null) throw Error('The synthetic device record was not retained.')
  storage.setItem(key, raw.replace('"easting":""', '"easting":"malformed"'))
  await expect(readRoadRecovery(actor, project, storage)).rejects.toThrow(
    /invalid|integrity/i,
  )
  await expect(writeRoadRecovery(r, null, storage, lock)).rejects.toThrow()
  expect(storage.getItem(key)).toContain('malformed')
})
it('does not claim retention when storage fails or fails to acknowledge the exact bytes', async () => {
  const failed = {
    ...storage,
    setItem: () => {
      throw Error('quota')
    },
  }
  await expect(writeRoadRecovery(record(), null, failed, lock)).rejects.toThrow(
    /quota|retai/i,
  )
  const ignored = { ...storage, setItem: () => {} }
  await expect(
    writeRoadRecovery(record(), null, ignored, lock),
  ).rejects.toThrow(/acknowledge/i)
})
it('requires the final outcome for the exact original pending command before clearing it', async () => {
  const r = record()
  r.draft.ips[0].easting = '500000'
  r.draft.vips[0].reducedLevel = '99'
  const road = evaluateRoadWorkbenchDraft(
    r.source.road,
    r.draft,
    r.source.reference,
  ).road
  if (!road) throw Error('The synthetic road draft could not be evaluated.')
  r.command = {
    version: 1,
    actorId: actor,
    projectId: project,
    requestId: entry,
    expectedEngineeringHash: r.source.engineeringHash,
    expectedReferenceHash: r.source.referenceHash,
    road,
  }
  const saved = await writeRoadRecovery(r, null, storage, lock)
  await expect(
    clearRoadRecovery(saved, undefined, storage, lock),
  ).rejects.toThrow(/unconfirmed|outcome/i)
  const outcome = {
    version: 1,
    state: 'cancelled',
    actorId: actor,
    projectId: project,
    requestId: entry,
    requestHash: await roadRequestDigest(r.command),
  }
  await expect(
    clearRoadRecovery(
      saved,
      { ...outcome, requestHash: 'c'.repeat(64) },
      storage,
      lock,
    ),
  ).rejects.toThrow(/match|identity/i)
  await clearRoadRecovery(saved, outcome, storage, lock)
  expect(await readRoadRecovery(actor, project, storage)).toBeNull()
})
it('will not overwrite a pending request or clear a replacement device draft', async () => {
  const r = record()
  r.draft.ips[0].easting = '500000'
  const road = evaluateRoadWorkbenchDraft(
    r.source.road,
    r.draft,
    r.source.reference,
  ).road
  if (!road) throw Error('The synthetic road draft could not be evaluated.')
  r.command = {
    version: 1,
    actorId: actor,
    projectId: project,
    requestId: entry,
    expectedEngineeringHash: r.source.engineeringHash,
    expectedReferenceHash: r.source.referenceHash,
    road,
  }
  const saved = await writeRoadRecovery(r, null, storage, lock)
  await expect(
    writeRoadRecovery(
      { ...r, command: null, sequence: 2 },
      saved.digest,
      storage,
      lock,
    ),
  ).rejects.toThrow(/pending|unconfirmed/i)
  await expect(
    clearRoadRecovery(
      { ...saved, digest: 'd'.repeat(64) },
      undefined,
      storage,
      lock,
    ),
  ).rejects.toThrow()
  expect(await readRoadRecovery(actor, project, storage)).not.toBeNull()
})
it('requires the same device entry and its next sequence for an updated draft', async () => {
  const r = record(),
    saved = await writeRoadRecovery(r, null, storage, lock)
  await expect(
    writeRoadRecovery(
      { ...r, entryId: '66666666-6666-4666-8666-666666666666', sequence: 2 },
      saved.digest,
      storage,
      lock,
    ),
  ).rejects.toThrow(/sequence|entry/i)
  await expect(
    writeRoadRecovery(
      { ...r, sequence: 1, updatedAt: '2026-10-27T01:00:00.000Z' },
      saved.digest,
      storage,
      lock,
    ),
  ).rejects.toThrow(/sequence|entry/i)
  expect((await readRoadRecovery(actor, project, storage))?.digest).toBe(
    saved.digest,
  )
})
it('reports unsupported recovery input plainly without writing or clearing the original data', async () => {
  const r = record()
  r.draft.ips[0].name = 'X'.repeat(201)
  await expect(writeRoadRecovery(r, null, storage, lock)).rejects.toThrow(
    /supported.*recovery/i,
  )
  expect(rows.size).toBe(0)
})
