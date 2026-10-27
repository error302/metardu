import { z } from 'zod'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { sha256Hex } from '@/lib/crypto/sha256'
import {
  ROAD_RECOVERY_LIMIT,
  roadHashSchema,
  roadWorkbenchCommandSchema,
  roadWorkbenchSourceSchema,
  roadWorkbenchOutcomeSchema,
  roadRequestDigest,
  normalizedRoadJson,
  type RoadWorkbenchOutcome,
} from './roadWorkbenchRecoveryContract'
import type {
  SchemePendingStorage,
  SchemePendingLock,
} from '@/lib/scheme/exportPending'
const uuid = z.string().uuid(),
  text = z.string().max(200)
export const roadWorkbenchDraftSchema = z
  .object({
    terrainRevisionId:text.optional(),
    terrainIntervalM:text.optional(),
    terrainHalfWidthM:text.optional(),
    startChainage: text,
    verticalStationIntervalM: text,
    ips: z
      .array(
        z
          .object({
            id: text.min(1),
            name: text,
            easting: text,
            northing: text,
            radius: text,
            hasTransition: z.boolean(),
            transitionLengthIn: text,
            transitionLengthOut: text,
          })
          .strict(),
      )
      .max(1000),
    vips: z
      .array(
        z
          .object({
            id: text.min(1),
            chainage: text,
            reducedLevel: text,
            curveLength: text,
            kValue: text,
          })
          .strict(),
      )
      .max(1000),
    template: z
      .object({
        carriagewayWidth: text,
        shoulderWidth: text,
        camber: text,
        shoulderCrossfall: text,
        subgradeDepth: text,
        cutSlope: text,
        fillSlope: text,
      })
      .strict(),
  })
  .strict()
const recordSchema = z
  .object({
    version: z.literal(1),
    actorId: uuid,
    projectId: uuid,
    entryId: uuid,
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    source: roadWorkbenchSourceSchema,
    draft: roadWorkbenchDraftSchema,
    command: roadWorkbenchCommandSchema.nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
const envelopeSchema = z
  .object({ record: recordSchema, digest: roadHashSchema })
  .strict()
export type RoadRecoveryRecord = z.infer<typeof recordSchema>
export type RetainedRoadRecovery = z.infer<typeof envelopeSchema>
export const roadRecoveryKey = (actor: string, project: string) =>
  `metardu:road-workbench:v1:${uuid.parse(actor)}:${uuid.parse(project)}`
export const roadRecoveryLock: SchemePendingLock = async (name, work) => {
  if (typeof navigator === 'undefined' || !navigator.locks?.request)
    throw Error(
      'This browser cannot lock a recoverable road draft. No save was sent.',
    )
  return navigator.locks.request(name, work)
}
function identity(record: RoadRecoveryRecord, actor: string, project: string) {
  if (
    record.actorId !== actor ||
    record.projectId !== project ||
    record.source.actorId !== actor ||
    record.source.projectId !== project
  )
    throw Error(
      'The road device record has an invalid account or project identity.',
    )
  const c = record.command
  if (
    c &&
    (c.actorId !== actor ||
      c.projectId !== project ||
      c.expectedEngineeringHash !== record.source.engineeringHash ||
      c.expectedReferenceHash !== record.source.referenceHash)
  )
    throw Error(
      'The pending road request does not match its retained original source.',
    )
}
export async function readRoadRecovery(
  actor: string,
  project: string,
  storage: SchemePendingStorage = window.localStorage,
): Promise<RetainedRoadRecovery | null> {
  const raw = storage.getItem(roadRecoveryKey(actor, project))
  if (raw === null) return null
  try {
    if (new TextEncoder().encode(raw).byteLength > ROAD_RECOVERY_LIMIT)
      throw Error('limit')
    const envelope = envelopeSchema.parse(JSON.parse(raw))
    identity(envelope.record, actor, project)
    if ((await sha256Hex(canonicalJson(envelope.record))) !== envelope.digest)
      throw Error('digest')
    return envelope
  } catch {
    throw Error(
      'The road device record failed its integrity or scope check. It is invalid and was preserved. Download it before starting another draft.',
    )
  }
}
export async function writeRoadRecovery(
  input: RoadRecoveryRecord,
  expectedDigest: string | null,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = roadRecoveryLock,
): Promise<RetainedRoadRecovery> {
  const parsed = recordSchema.safeParse(normalizedRoadJson(input))
  if (!parsed.success)
    throw Error(
      'The current inputs exceed the supported device recovery format. Keep this page open and download the recovery file; no save was sent.',
    )
  const record = parsed.data
  identity(record, record.actorId, record.projectId)
  const envelope = { record, digest: await sha256Hex(canonicalJson(record)) },
    raw = JSON.stringify(envelope)
  if (new TextEncoder().encode(raw).byteLength > ROAD_RECOVERY_LIMIT)
    throw Error(
      'The road recovery record exceeds this device retention limit. Keep the original work package; no save was sent.',
    )
  const key = roadRecoveryKey(record.actorId, record.projectId)
  return withLock(key, async () => {
    const current = await readRoadRecovery(
      record.actorId,
      record.projectId,
      storage,
    )
    if ((current?.digest ?? null) !== expectedDigest)
      throw Error(
        'The road recovery record changed in another tab. Its newer draft was preserved; keep these inputs for recovery.',
      )
    if (current && canonicalJson(current.record) === canonicalJson(record))
      return current
    if (
      current
        ? record.entryId !== current.record.entryId ||
          record.sequence !== current.record.sequence + 1
        : record.sequence !== 1
    )
      throw Error(
        'The road device entry or sequence changed. Its original draft was preserved.',
      )
    if (
      current?.record.command &&
      (canonicalJson(current.record.command) !==
        canonicalJson(record.command) ||
        canonicalJson(current.record.draft) !== canonicalJson(record.draft) ||
        canonicalJson(current.record.source) !== canonicalJson(record.source))
    )
      throw Error(
        'An unconfirmed pending road request is retained. Recover or cancel it before replacing its inputs.',
      )
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw)
      throw Error(
        'The device did not acknowledge the exact road recovery record. No save was sent.',
      )
    return envelope
  })
}
export async function validateRoadOutcome(
  record: RoadRecoveryRecord,
  input: unknown,
): Promise<RoadWorkbenchOutcome> {
  if (!record.command)
    throw Error('There is no retained road request for this outcome.')
  const parsed = roadWorkbenchOutcomeSchema.safeParse(input)
  if (!parsed.success)
    throw Error(
      'The final road outcome is invalid. Its original device request was preserved.',
    )
  const outcome = parsed.data,
    c = record.command
  if (
    outcome.actorId !== c.actorId ||
    outcome.projectId !== c.projectId ||
    outcome.requestId !== c.requestId ||
    outcome.requestHash !== (await roadRequestDigest(c))
  )
    throw Error(
      'The final road outcome does not match the original request identity. Its device record was preserved.',
    )
  if (
    outcome.state === 'committed' &&
    (outcome.roadHash !== (await sha256Hex(canonicalJson({ road: c.road }))) ||
      canonicalJson(outcome.road) !== canonicalJson(c.road) ||
      outcome.referenceHash !== c.expectedReferenceHash ||
      canonicalJson(outcome.reference) !==
        canonicalJson(record.source.reference))
  )
    throw Error(
      'The road acknowledgement does not match the retained inputs and project reference. Its device record was preserved.',
    )
  return outcome
}
export async function clearRoadRecovery(
  saved: RetainedRoadRecovery,
  outcome: unknown,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = roadRecoveryLock,
) {
  if (saved.record.command && outcome === undefined)
    throw Error(
      'The unconfirmed road request requires its exact final outcome before it can be cleared.',
    )
  if (saved.record.command) await validateRoadOutcome(saved.record, outcome)
  else if (outcome !== undefined)
    throw Error('The device draft has no pending request to acknowledge.')
  const r = saved.record,
    key = roadRecoveryKey(r.actorId, r.projectId)
  await withLock(key, async () => {
    const current = await readRoadRecovery(r.actorId, r.projectId, storage)
    if (!current || current.digest !== saved.digest)
      throw Error(
        'The road device record changed. Its replacement was preserved.',
      )
    storage.removeItem(key)
    if (storage.getItem(key) !== null)
      throw Error('The acknowledged road device record could not be cleared.')
  })
}
/** A cancelled request becomes an editable retained draft in one device write, without a clear/write gap. */
export async function retainCancelledRoadDraft(
  saved: RetainedRoadRecovery,
  input: unknown,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = roadRecoveryLock,
): Promise<RetainedRoadRecovery> {
  const outcome = await validateRoadOutcome(saved.record, input)
  if (outcome.state !== 'cancelled')
    throw Error(
      'Only a confirmed cancellation can release this pending request for editing.',
    )
  const record = recordSchema.parse({
    ...saved.record,
    entryId: crypto.randomUUID(),
    sequence: 1,
    command: null,
    updatedAt: new Date().toISOString(),
  })
  const next = { record, digest: await sha256Hex(canonicalJson(record)) },
    raw = JSON.stringify(next)
  if (new TextEncoder().encode(raw).byteLength > ROAD_RECOVERY_LIMIT)
    throw Error(
      'The cancelled draft could not be retained within the device limit.',
    )
  const key = roadRecoveryKey(record.actorId, record.projectId)
  return withLock(key, async () => {
    const current = await readRoadRecovery(
      record.actorId,
      record.projectId,
      storage,
    )
    if (current?.digest !== saved.digest)
      throw Error(
        'The road device record changed. Its replacement was preserved.',
      )
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw)
      throw Error(
        'The device did not acknowledge the retained cancelled draft.',
      )
    return next
  })
}
