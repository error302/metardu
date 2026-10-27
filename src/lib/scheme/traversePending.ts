import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  TRAVERSE_BODY_LIMIT,
  traverseCommandSchema,
  retainedTraverseSchema,
  traverseOutcomeSchema,
  type TraverseCommand,
  type TraverseOutcome,
} from './traverseContract'
import type { SchemePendingLock, SchemePendingStorage } from './exportPending'

const schema = z
  .object({
    version: z.literal(1),
    body: traverseCommandSchema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type PendingTraverse = z.infer<typeof schema>
const uuid = z.string().guid()
export const traversePendingKey = (
  actor: string,
  project: string,
  parcel: string,
) =>
  `metardu:retained-traverse:v1:${uuid.parse(actor)}:${uuid.parse(project)}:${uuid.parse(parcel)}`
export async function traverseDigest(value: string | Uint8Array) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}
const lock: SchemePendingLock = async (name, work) => {
  if (!navigator.locks?.request)
    throw new Error(
      'This browser cannot lock a recoverable request. No computation was sent.',
    )
  return navigator.locks.request(name, work)
}
export async function readTraversePending(
  actor: string,
  project: string,
  parcel: string,
  storage: SchemePendingStorage = window.localStorage,
) {
  const text = storage.getItem(traversePendingKey(actor, project, parcel))
  if (text === null) return null
  try {
    const pending = schema.parse(JSON.parse(text)),
      b = pending.body
    if (
      b.expectedUserId !== actor ||
      b.projectId !== project ||
      b.parcelId !== parcel ||
      (await traverseDigest(canonicalJSON(b))) !== pending.inputHash
    )
      throw Error('identity')
    return pending
  } catch {
    throw new Error(
      'The device record is invalid. It was preserved. Download it for recovery before starting another request.',
    )
  }
}
export async function prepareTraversePending(
  input: TraverseCommand,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = lock,
) {
  const body = traverseCommandSchema.parse(JSON.parse(JSON.stringify(input)))
  if (
    new TextEncoder().encode(JSON.stringify(body)).byteLength >
    TRAVERSE_BODY_LIMIT
  )
    throw Error(
      'The original request exceeds the retained byte limit. No computation was sent.',
    )
  const pending: PendingTraverse = {
      version: 1,
      body,
      inputHash: await traverseDigest(canonicalJSON(body)),
    },
    k = traversePendingKey(body.expectedUserId, body.projectId, body.parcelId)
  return withLock(k, async () => {
    const previous = await readTraversePending(
      body.expectedUserId,
      body.projectId,
      body.parcelId,
      storage,
    )
    if (previous) {
      if (
        canonicalJSON({ ...previous.body, requestId: body.requestId }) ===
        canonicalJSON(body)
      )
        return previous
      throw Error(
        'An unconfirmed request is retained. Recover or cancel it before starting another.',
      )
    }
    storage.setItem(k, JSON.stringify(pending))
    if (storage.getItem(k) !== JSON.stringify(pending))
      throw Error(
        'The device did not acknowledge the request. No computation was sent.',
      )
    return pending
  })
}
function identity(pending: PendingTraverse, outcome: TraverseOutcome) {
  const b = pending.body
  if (
    outcome.actorId !== b.expectedUserId ||
    outcome.projectId !== b.projectId ||
    outcome.parcelId !== b.parcelId ||
    outcome.requestId !== b.requestId ||
    outcome.inputHash !== pending.inputHash
  )
    throw Error(
      'The acknowledgement does not match this device request. Its original record was preserved.',
    )
}
export async function validateTraverseAcknowledgement(
  pending: PendingTraverse,
  input: unknown,
) {
  const selected = retainedTraverseSchema.parse(input),
    r = selected.receipt,
    b = pending.body
  identity(pending, r)
  const source =
    b.source.kind === 'manual'
      ? canonicalJSON({
          source: b.source,
          provenance: b.provenance,
          control: b.control,
          observations: b.observations,
        })
      : Uint8Array.from(atob(b.source.bytesBase64), (v) => v.charCodeAt(0))
  if (
    canonicalJSON(selected.input) !== canonicalJSON(b) ||
    (await traverseDigest(canonicalJSON(selected.result))) !== r.resultHash ||
    (await traverseDigest(source)) !== r.sourceHash ||
    r.coordinateIds.length !== selected.result.coordinates.length ||
    r.observationIds.length !== b.observations.length ||
    new Set([...r.coordinateIds, ...r.observationIds]).size !==
      r.coordinateIds.length + r.observationIds.length
  )
    throw Error(
      'The retained result or source hash is inconsistent. The device record was preserved.',
    )
  return selected
}
/** Call only after validating the committed artifact, or a final cancellation. */
export async function clearTraversePending(
  pending: PendingTraverse,
  input: unknown,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = lock,
) {
  const outcome = traverseOutcomeSchema.parse(input)
  identity(pending, outcome)
  const b = pending.body,
    k = traversePendingKey(b.expectedUserId, b.projectId, b.parcelId)
  await withLock(k, async () => {
    const current = await readTraversePending(
      b.expectedUserId,
      b.projectId,
      b.parcelId,
      storage,
    )
    if (!current) return
    if (canonicalJSON(current) !== canonicalJSON(pending))
      throw Error('The device record changed. It was preserved.')
    storage.removeItem(k)
    if (storage.getItem(k) !== null)
      throw Error(
        'The final receipt is available, but the device record could not be cleared. Recover it again.',
      )
  })
}
