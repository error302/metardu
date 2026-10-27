import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJSON } from '@/lib/audit/auditHash'
import {
  boundaryCancelSchema,
  boundaryOutcomeSchema,
  boundaryReceiptSchema,
  type BoundaryReceipt,
  type BoundaryOutcome,
} from './boundaryReview'
const fail = (message: string, status = 409) =>
  new AppError(message, status, 'BOUNDARY_REQUEST')
const identity = z.string().guid()
export function boundaryStorageFailure(failure: unknown): never {
  const code = z.object({ code: z.string() }).safeParse(failure)
  if (code.success && ['42P01', '42703'].includes(code.data.code))
    throw fail(
      'Boundary recovery requires the reviewed compatible schema. The request remains unconfirmed.',
      503,
    )
  if (code.success && ['23505', '23503', '23514'].includes(code.data.code))
    throw fail('The final boundary request conflicts with retained evidence.')
  throw failure
}
export async function lockBoundaryScope(
  client: PoolClient,
  actor: string,
  project: string,
  parcel: string,
  write = false,
) {
  for (const id of [actor, project, parcel])
    if (!identity.safeParse(id).success)
      throw fail(
        'Valid account, project and parcel identifiers are required.',
        400,
      )
  if (
    (
      await client.query(
        `SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR ${write ? 'UPDATE' : 'SHARE'}`,
        [project, actor],
      )
    ).rows.length !== 1
  )
    throw fail('Project not found for this account.', 404)
  if (
    (
      await client.query(
        `SELECT id FROM parcels WHERE id=$1 AND project_id=$2 FOR ${write ? 'UPDATE' : 'SHARE'}`,
        [parcel, project],
      )
    ).rows.length !== 1
  )
    throw fail('Parcel not found for this project.', 404)
}
/** Caller holds project/parcel locks. A final outcome always checks the complete mirror. */
export async function findBoundaryRequest(
  client: PoolClient,
  actor: string,
  project: string,
  parcel: string,
  request: string,
): Promise<BoundaryOutcome | null> {
  if (!identity.safeParse(request).success)
    throw fail('A valid boundary request identifier is required.', 400)
  const rows = await client.query<{
    actor_id: string
    request_id: string
    project_id: string
    parcel_id: string
    input_hash: string
    state: string
    draft_id: string | null
    receipt: unknown
  }>(
    'SELECT actor_id,request_id,project_id,parcel_id,input_hash,state,draft_id,receipt FROM parcel_boundary_requests WHERE actor_id=$1 AND request_id=$2',
    [actor, request],
  )
  const row = rows.rows[0]
  if (!row) return null
  if (row.project_id !== project || row.parcel_id !== parcel)
    throw fail('Boundary request not found in this project and parcel.', 404)
  const envelope = {
    actorId: actor,
    projectId: project,
    parcelId: parcel,
    requestId: request,
    inputHash: row.input_hash,
  }
  const drafts = await client.query<{
    id: string
    project_id: string
    parcel_id: string
    traverse_id: string
    input_hash: string
    evidence_hash: string
    receipt: unknown
  }>(
    'SELECT id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,receipt FROM parcel_boundary_drafts WHERE actor_id=$1 AND request_id=$2',
    [actor, request],
  )
  if (row.state === 'cancelled') {
    const expected = { ...envelope, state: 'cancelled' as const }
    if (
      row.draft_id !== null ||
      drafts.rows.length ||
      canonicalJSON(row.receipt) !== canonicalJSON(expected)
    )
      throw fail('The final boundary cancellation is inconsistent.', 500)
    return boundaryOutcomeSchema.parse(expected)
  }
  const d = drafts.rows[0],
    parsed = boundaryReceiptSchema.safeParse(row.receipt)
  if (
    row.state !== 'committed' ||
    !parsed.success ||
    !d ||
    drafts.rows.length !== 1 ||
    d.id !== row.draft_id ||
    d.project_id !== project ||
    d.parcel_id !== parcel ||
    d.input_hash !== row.input_hash ||
    canonicalJSON(d.receipt) !== canonicalJSON(row.receipt)
  )
    throw fail('The final boundary receipt graph is inconsistent.', 500)
  const r = parsed.data
  if (
    r.receiptId !== d.id ||
    r.requestId !== request ||
    r.projectId !== project ||
    r.parcelId !== parcel ||
    r.traverseId !== d.traverse_id ||
    r.inputHash !== d.input_hash ||
    r.evidenceHash !== d.evidence_hash ||
    (r.actorId !== undefined && r.actorId !== actor)
  )
    throw fail('The retained boundary identity is inconsistent.', 500)
  return boundaryOutcomeSchema.parse({
    ...envelope,
    state: 'committed',
    receipt: r,
  })
}
export async function readBoundaryRequestOutcome(
  actor: string,
  project: string,
  parcel: string,
  request: string,
  client?: PoolClient,
) {
  const read = async (c: PoolClient) => {
    await lockBoundaryScope(c, actor, project, parcel)
    const outcome = await findBoundaryRequest(
      c,
      actor,
      project,
      parcel,
      request,
    )
    if (!outcome)
      throw fail(
        'No final boundary request was found. Keep the original device record and retry or cancel it.',
        404,
      )
    return outcome
  }
  try {
    return client ? await read(client) : await db.transaction(read)
  } catch (failure) {
    boundaryStorageFailure(failure)
  }
}
export async function appendCommittedBoundaryRequest(
  client: PoolClient,
  actor: string,
  r: BoundaryReceipt,
) {
  const rows = await client.query<{ receipt: unknown }>(
    "INSERT INTO parcel_boundary_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,draft_id,receipt) VALUES($1,$2,$3,$4,$5,'committed',$6,$7::jsonb) RETURNING receipt",
    [
      actor,
      r.requestId,
      r.projectId,
      r.parcelId,
      r.inputHash,
      r.receiptId,
      JSON.stringify(r),
    ],
  )
  if (
    rows.rows.length !== 1 ||
    canonicalJSON(rows.rows[0].receipt) !== canonicalJSON(r)
  )
    throw fail(
      'The final boundary journal did not acknowledge the exact draft. The complete save was rolled back.',
      500,
    )
  const outcome = await findBoundaryRequest(
    client,
    actor,
    r.projectId,
    r.parcelId,
    r.requestId,
  )
  if (
    !outcome ||
    outcome.state !== 'committed' ||
    canonicalJSON(outcome.receipt) !== canonicalJSON(r)
  )
    throw fail('The final boundary graph was not acknowledged.', 500)
}
export async function cancelBoundaryRequest(
  actor: string,
  project: string,
  input: unknown,
) {
  const parsed = boundaryCancelSchema.safeParse(input)
  if (!parsed.success)
    throw fail(
      'Choose the original boundary request and input fingerprint before cancellation.',
      400,
    )
  const b = parsed.data
  if (b.expected_user_id !== actor)
    throw fail(
      'The signed-in account changed. Return to the original account to recover this request.',
      403,
    )
  try {
    return await db.transaction(async (client) => {
      await lockBoundaryScope(client, actor, project, b.parcel_id, true)
      const previous = await findBoundaryRequest(
        client,
        actor,
        project,
        b.parcel_id,
        b.request_id,
      )
      if (previous) {
        if (previous.inputHash !== b.input_hash)
          throw fail('This request belongs to a different boundary intent.')
        return previous
      }
      const outcome: BoundaryOutcome = {
        state: 'cancelled',
        actorId: actor,
        projectId: project,
        parcelId: b.parcel_id,
        requestId: b.request_id,
        inputHash: b.input_hash,
      }
      const result = await client.query<{ receipt: unknown }>(
        "INSERT INTO parcel_boundary_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,receipt) VALUES($1,$2,$3,$4,$5,'cancelled',$6::jsonb) RETURNING receipt",
        [
          actor,
          b.request_id,
          project,
          b.parcel_id,
          b.input_hash,
          JSON.stringify(outcome),
        ],
      )
      if (
        result.rows.length !== 1 ||
        canonicalJSON(result.rows[0].receipt) !== canonicalJSON(outcome)
      )
        throw fail(
          'Boundary cancellation was not acknowledged. Keep the device record.',
          500,
        )
      const saved = await findBoundaryRequest(
        client,
        actor,
        project,
        b.parcel_id,
        b.request_id,
      )
      if (!saved || canonicalJSON(saved) !== canonicalJSON(outcome))
        throw fail('The final cancellation graph is inconsistent.', 500)
      return saved
    })
  } catch (failure) {
    boundaryStorageFailure(failure)
  }
}
