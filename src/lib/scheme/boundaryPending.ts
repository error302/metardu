import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { traverseDigest } from './traversePending'
import type { SchemePendingLock, SchemePendingStorage } from './exportPending'
import {
  boundaryCommandSchema,
  boundarySourceSchema,
  boundaryReceiptSchema,
  boundaryOutcomeSchema,
  prepareBoundary,
  type BoundaryCommand,
  type BoundarySource,
  type BoundaryReceipt,
} from './boundaryReview'
const recordSchema = z
  .object({
    version: z.literal(1),
    projectId: z.string().uuid(),
    command: boundaryCommandSchema,
    source: boundarySourceSchema,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type PendingBoundary = z.infer<typeof recordSchema>
const uuid = z.string().uuid()
export const boundaryPendingKey = (
  actor: string,
  project: string,
  parcel: string,
) =>
  `metardu:boundary-request:v1:${uuid.parse(actor)}:${uuid.parse(project)}:${uuid.parse(parcel)}`
const lock: SchemePendingLock = async (name, work) => {
  if (!navigator.locks?.request)
    throw Error(
      'This browser cannot lock a recoverable boundary request. No save was sent.',
    )
  return navigator.locks.request(name, work)
}
const inputHash = (project: string, command: BoundaryCommand) =>
  traverseDigest(
    canonicalJSON({
      protocol: 'reviewed-parcel-boundary-v1',
      project,
      command,
    }),
  )
function sourceIdentity(
  project: string,
  command: BoundaryCommand,
  source: BoundarySource,
) {
  if (
    source.projectId !== project ||
    source.parcelId !== command.parcel_id ||
    source.traverseId !== command.traverse_id ||
    source.evidenceHash !== command.evidence_hash ||
    source.sourceCrs !== command.source_crs ||
    source.pointWindow ||
    source.points.length !== command.ordered_coordinate_ids.length
  )
    throw Error(
      'The original boundary source does not match its device request.',
    )
  prepareBoundary(source, command.ordered_coordinate_ids, command.source_crs)
}
export async function readBoundaryPending(
  actor: string,
  project: string,
  parcel: string,
  storage: SchemePendingStorage = window.localStorage,
) {
  const raw = storage.getItem(boundaryPendingKey(actor, project, parcel))
  if (raw === null) return null
  try {
    if (new TextEncoder().encode(raw).byteLength > 1048576) throw Error('size')
    const record = recordSchema.parse(JSON.parse(raw)),
      b = record.command
    if (
      record.projectId !== project ||
      b.expected_user_id !== actor ||
      b.parcel_id !== parcel ||
      (await inputHash(project, b)) !== record.inputHash ||
      (await traverseDigest(canonicalJSON(record.source))) !== record.sourceHash
    )
      throw Error('identity')
    sourceIdentity(project, b, record.source)
    return record
  } catch {
    throw Error(
      'The boundary device record is invalid. It was preserved. Download it for recovery before starting another request.',
    )
  }
}
export async function prepareBoundaryPending(
  project: string,
  input: BoundaryCommand,
  selected: BoundarySource,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = lock,
) {
  const command = boundaryCommandSchema.parse(
      JSON.parse(JSON.stringify(input)),
    ),
    source = boundarySourceSchema.parse(JSON.parse(JSON.stringify(selected)))
  sourceIdentity(project, command, source)
  const record: PendingBoundary = {
    version: 1,
    projectId: project,
    command,
    source,
    inputHash: await inputHash(project, command),
    sourceHash: await traverseDigest(canonicalJSON(source)),
  }
  const k = boundaryPendingKey(
    command.expected_user_id,
    project,
    command.parcel_id,
  )
  return withLock(k, async () => {
    const previous = await readBoundaryPending(
      command.expected_user_id,
      project,
      command.parcel_id,
      storage,
    )
    if (previous) {
      if (
        canonicalJSON({
          ...previous.command,
          request_id: command.request_id,
        }) === canonicalJSON(command)
      )
        return previous
      throw Error(
        'An unconfirmed boundary request is retained. Recover or cancel it before starting another.',
      )
    }
    const raw = JSON.stringify(record)
    if (new TextEncoder().encode(raw).byteLength > 1048576)
      throw Error(
        'The boundary device record exceeds its retention limit. No save was sent.',
      )
    storage.setItem(k, raw)
    if (storage.getItem(k) !== raw)
      throw Error(
        'The device did not acknowledge the boundary request. No save was sent.',
      )
    return record
  })
}
export function validateBoundaryAcknowledgement(
  record: PendingBoundary,
  input: unknown,
): BoundaryReceipt {
  const r = boundaryReceiptSchema.parse(input),
    b = record.command,
    s = record.source,
    g = prepareBoundary(s, b.ordered_coordinate_ids, b.source_crs)
  if (
    r.actorId !== b.expected_user_id ||
    r.projectId !== record.projectId ||
    r.parcelId !== b.parcel_id ||
    r.traverseId !== b.traverse_id ||
    r.requestId !== b.request_id ||
    r.inputHash !== record.inputHash ||
    r.evidenceHash !== b.evidence_hash ||
    r.sourceCrs !== b.source_crs ||
    r.parcelRevision !== s.parcelRevision + 1 ||
    canonicalJSON(r.orderedCoordinateIds) !==
      canonicalJSON(b.ordered_coordinate_ids) ||
    canonicalJSON(r.polygon) !== canonicalJSON(g.polygon) ||
    r.areaHa !== g.areaHa ||
    r.gridAreaSqM !== g.gridAreaSqM ||
    r.gridPerimeterM !== g.gridPerimeterM
  )
    throw Error(
      'The boundary acknowledgement does not match the original device request. Its record was preserved.',
    )
  return r
}
export async function acknowledgeBoundaryOutcome(
  record: PendingBoundary,
  input: unknown,
  storage: SchemePendingStorage = window.localStorage,
  withLock: SchemePendingLock = lock,
) {
  const outcome = boundaryOutcomeSchema.parse(input),
    b = record.command
  if (
    outcome.actorId !== b.expected_user_id ||
    outcome.projectId !== record.projectId ||
    outcome.parcelId !== b.parcel_id ||
    outcome.requestId !== b.request_id ||
    outcome.inputHash !== record.inputHash
  )
    throw Error(
      'The final boundary outcome does not match the original device request. Its record was preserved.',
    )
  if (outcome.state === 'committed')
    validateBoundaryAcknowledgement(record, outcome.receipt)
  const k = boundaryPendingKey(
    b.expected_user_id,
    record.projectId,
    b.parcel_id,
  )
  await withLock(k, async () => {
    const current = await readBoundaryPending(
      b.expected_user_id,
      record.projectId,
      b.parcel_id,
      storage,
    )
    if (!current || canonicalJSON(current) !== canonicalJSON(record))
      throw Error(
        'The device boundary record changed. Its replacement was preserved.',
      )
    storage.removeItem(k)
    if (storage.getItem(k) !== null)
      throw Error('The acknowledged device record could not be cleared.')
  })
  return outcome
}
