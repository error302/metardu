import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import {
  cancelTraverseSchema,
  computeRetainedTraverse,
  retainedTraverseSchema,
  traverseCommandSchema,
  traverseContextSchema,
  traverseOutcomeSchema,
  traverseReadSchema,
  traverseReceiptSchema,
  TRAVERSE_ENGINE,
  type TraverseCommand,
  type TraverseOutcome,
} from './traverseContract'

const digest = (text: string | Uint8Array) =>
  createHash('sha256').update(text).digest('hex')
const hash = (value: unknown) => digest(canonicalJSON(value))
const fail = (message: string, status = 409) =>
  new AppError(message, status, 'RETAINED_TRAVERSE')
function ids(...values: string[]) {
  if (values.some((v) => !z.string().uuid().safeParse(v).success))
    throw fail(
      'Valid account, project, parcel and request identifiers are required.',
      400,
    )
}
async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  try {
    return await db.transaction(work)
  } catch (error) {
    const parsed = z.object({ code: z.string() }).safeParse(error)
    if (parsed.success && ['42P01', '42703'].includes(parsed.data.code))
      throw fail(
        'Retained traverse storage is unavailable. No source was replaced.',
        503,
      )
    if (
      parsed.success &&
      ['23503', '23505', '40001', '40P01'].includes(parsed.data.code)
    )
      throw fail(
        'The related source or request changed. Recover the original request before retrying.',
      )
    throw error
  }
}
type Frame = {
  context: z.infer<typeof traverseContextSchema>
  referenceRecord: string | null
  reference: Record<string, unknown> | null
}
async function frame(
  client: PoolClient,
  actor: string,
  project: string,
  parcel: string,
  write = false,
): Promise<Frame> {
  ids(actor, project, parcel)
  const projectRow = (
    await client.query<{ version: string }>(
      `SELECT xmin::text version FROM projects WHERE id=$1 AND user_id=$2 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [project, actor],
    )
  ).rows[0]
  if (!projectRow) throw fail('Project/parcel not found for this account.', 404)
  const parcelRow = (
    await client.query<{
      id: string
      project_id: string
      block_id: string | null
      version: string
      revision: number
      updated_at: string
    }>(
      `SELECT id,project_id,block_id,xmin::text version,COALESCE(revision_number,0) revision,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_at FROM parcels WHERE id=$1 AND project_id=$2 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [parcel, project],
    )
  ).rows[0]
  if (!parcelRow) throw fail('Project/parcel not found for this account.', 404)
  const ref = (
    await client.query<{
      record: string | null
      bytes: number
      version: string
    }>(
      `SELECT CASE WHEN octet_length(to_jsonb(r)::text)<=262144 THEN to_jsonb(r)::text ELSE NULL END record,octet_length(to_jsonb(r)::text) bytes,xmin::text version FROM project_reference_systems r WHERE project_id=$1 FOR SHARE`,
      [project],
    )
  ).rows[0]
  if (ref && (ref.bytes > 262144 || !ref.record))
    throw fail(
      'The reference declaration exceeds the retained review window.',
      413,
    )
  const referenceRecord = ref?.record ?? null
  const reference = referenceRecord
    ? z.record(z.unknown()).parse(JSON.parse(referenceRecord))
    : null
  const latest =
    (
      await client.query<{ id: string }>(
        'SELECT id FROM parcel_traverse_revisions WHERE project_id=$1 AND parcel_id=$2 ORDER BY ordinal DESC LIMIT 1 FOR SHARE',
        [project, parcel],
      )
    ).rows[0]?.id ?? null
  const prerequisites: string[] = []
  let sourceCrs: string | null = null,
    adoptedFactor: string | null = null
  try {
    const crs = assertProjectedCrs(
      typeof reference?.horizontal_crs === 'string'
        ? reference.horizontal_crs
        : '',
    )
    if (crs.units !== 'metres') throw Error('Units')
    sourceCrs = crs.code
  } catch {
    prerequisites.push('Declare the projected project reference in metres.')
  }
  if (reference?.units !== 'metres' || reference?.distance_mode !== 'grid')
    prerequisites.push(
      'This workflow requires an explicitly declared metre grid, not an uncalibrated ground-coordinate mode.',
    )
  const factor = reference?.combined_scale_factor
  if (
    typeof factor === 'number' &&
    Number.isFinite(factor) &&
    factor > 0 &&
    ['surveyor', 'computed'].includes(String(reference?.csf_provenance))
  )
    adoptedFactor = String(factor)
  else
    prerequisites.push(
      'Declare and review the project combined ground-to-grid scale factor and its provenance; no unity factor is assumed.',
    )
  const context = traverseContextSchema.parse({
    actorId: actor,
    projectId: project,
    parcelId: parcel,
    evidenceHash: hash({
      projectVersion: projectRow.version,
      parcel: parcelRow,
      referenceRecord,
      referenceVersion: ref?.version ?? null,
      latestRevisionId: latest,
    }),
    latestRevisionId: latest,
    sourceCrs,
    adoptedFactor,
    verticalDatum:
      typeof reference?.vertical_datum === 'string'
        ? reference.vertical_datum
        : null,
    prerequisites,
    storageReady: true,
  })
  return { context, referenceRecord, reference }
}
function sourceHash(body: TraverseCommand) {
  if (body.source.kind === 'manual')
    return hash({
      source: body.source,
      provenance: body.provenance,
      control: body.control,
      observations: body.observations,
    })
  const bytes = Buffer.from(body.source.bytesBase64, 'base64')
  if (
    bytes.length > 2097152 ||
    bytes.toString('base64') !== body.source.bytesBase64
  )
    throw fail(
      'The original attachment must be canonical base64 and at most 2 MiB.',
      400,
    )
  return digest(bytes)
}
function command(input: unknown) {
  const parsed = traverseCommandSchema.safeParse(input)
  if (!parsed.success)
    throw fail(
      'A complete reviewed traverse command with UUIDs, original strings and an explicit convention is required.',
      400,
    )
  return parsed.data
}
function validateFrame(f: Frame, body: TraverseCommand) {
  if (
    f.context.evidenceHash !== body.evidenceHash ||
    f.context.latestRevisionId !== body.baseRevisionId
  )
    throw fail(
      'The parcel, reference or retained head changed. Refresh and review before starting another request.',
    )
  if (
    f.context.prerequisites.length ||
    f.context.sourceCrs !== body.sourceCrs ||
    !f.referenceRecord
  )
    throw fail(
      'Review the project reference and adopted grid factor before computing.',
    )
  if (
    Number(body.reduction.combinedScaleFactor) !==
    Number(f.context.adoptedFactor)
  )
    throw fail(
      'The supplied factor differs from the retained project declaration.',
    )
  if (
    body.control.openingRL.trim() &&
    (!f.context.verticalDatum?.trim() ||
      !['orthometric', 'ellipsoidal', 'trig', 'local'].includes(
        String(f.reference?.vertical_reference),
      ))
  )
    throw fail(
      'Declare the vertical datum and height reference before retaining absolute levels.',
    )
}
type RevisionRow = {
  id: string
  actor_id: string
  request_id: string
  project_id: string
  parcel_id: string
  traverse_id: string
  ordinal: number
  parent_revision_id: string | null
  input_hash: string
  result_hash: string
  source_hash: string
  reference_hash: string
  request_hash: string
  request_text: string
  engine_version: string
  input_snapshot: unknown
  result_snapshot: unknown
  reference_record: string
  receipt: unknown
  created: string
}
async function checkedRevision(
  client: PoolClient,
  actor: string,
  project: string,
  parcel: string,
  revision: string,
  currentReference: string | null,
) {
  const row = (
    await client.query<RevisionRow>(
      `SELECT r.*,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created FROM parcel_traverse_revisions r JOIN projects p ON p.id=r.project_id WHERE r.id=$1 AND r.project_id=$2 AND r.parcel_id=$3 AND p.user_id=$4 FOR SHARE OF r`,
      [revision, project, parcel, actor],
    )
  ).rows[0]
  if (!row)
    throw fail(
      'Retained traverse revision not found for this project and account.',
      404,
    )
  const receipt = traverseReceiptSchema.safeParse(row.receipt),
    input = traverseCommandSchema.safeParse(row.input_snapshot)
  if (!receipt.success || !input.success)
    throw fail('The retained traverse receipt or input is inconsistent.', 500)
  const r = receipt.data,
    b = input.data
  const journal = (
    await client.query<{
      state: string
      revision_id: string | null
      input_hash: string
      receipt: unknown
    }>(
      'SELECT state,revision_id,input_hash,receipt FROM parcel_traverse_requests WHERE actor_id=$1 AND request_id=$2 AND project_id=$3 AND parcel_id=$4',
      [row.actor_id, row.request_id, project, parcel],
    )
  ).rows[0]
  if (
    !journal ||
    journal.state !== 'committed' ||
    journal.revision_id !== row.id ||
    journal.input_hash !== row.input_hash ||
    hash(journal.receipt) !== hash(row.receipt)
  )
    throw fail('The final retained request journal is inconsistent.', 500)
  if (
    row.engine_version !== TRAVERSE_ENGINE ||
    r.revisionId !== row.id ||
    r.actorId !== row.actor_id ||
    r.requestId !== row.request_id ||
    r.projectId !== project ||
    r.parcelId !== parcel ||
    r.traverseId !== row.traverse_id ||
    r.ordinal !== row.ordinal ||
    r.createdAt !== row.created ||
    b.expectedUserId !== row.actor_id ||
    b.requestId !== row.request_id ||
    b.projectId !== project ||
    b.parcelId !== parcel ||
    b.baseRevisionId !== row.parent_revision_id
  )
    throw fail('The retained traverse identity/version is inconsistent.', 500)
  if (
    hash(b) !== row.input_hash ||
    row.input_hash !== r.inputHash ||
    sourceHash(b) !== row.source_hash ||
    row.source_hash !== r.sourceHash ||
    digest(row.reference_record) !== row.reference_hash ||
    row.reference_hash !== r.referenceHash ||
    digest(row.request_text) !== row.request_hash ||
    row.request_hash !== r.requestHash
  )
    throw fail('The retained original source fingerprint is inconsistent.', 500)
  let wire: unknown
  try {
    wire = JSON.parse(row.request_text)
  } catch {
    throw fail('The retained request bytes are not valid JSON.', 500)
  }
  if (hash(command(wire)) !== row.input_hash)
    throw fail(
      'The retained request bytes disagree with the admitted input.',
      500,
    )
  const result = computeRetainedTraverse(b)
  if (
    hash(result) !== row.result_hash ||
    row.result_hash !== r.resultHash ||
    hash(row.result_snapshot) !== row.result_hash
  )
    throw fail(
      'The retained numerical result disagrees with its original inputs.',
      500,
    )
  const parent = (
    await client.query<{
      id: string
      retained_revision_id: string
      version: number
      status: string
      traverse_name: string
    }>(
      'SELECT id,retained_revision_id,version,status,traverse_name FROM parcel_traverses WHERE id=$1 AND project_id=$2 AND parcel_id=$3',
      [r.traverseId, project, parcel],
    )
  ).rows[0]
  if (
    !parent ||
    parent.retained_revision_id !== r.revisionId ||
    parent.version !== r.ordinal ||
    parent.status !== 'draft_unverified' ||
    parent.traverse_name !== b.name
  )
    throw fail(
      'The canonical traverse parent disagrees with the retained revision.',
      500,
    )
  const coordinates = await client.query<{
    id: string
    coordinate_order: number
    station_name: string
    easting: string
    northing: string
    elevation: number | null
  }>(
    'SELECT id,coordinate_order,station_name,easting::text,northing::text,elevation FROM traverse_coordinates WHERE traverse_id=$1 ORDER BY coordinate_order,id LIMIT 2002',
    [r.traverseId],
  )
  const observations = await client.query<{
    id: string
    observation_order: number
    station_from: string
    station_to: string
    bearing: number | null
    distance: number | null
    face: string
    source_kind: string
    retained_input: unknown
  }>(
    'SELECT id,observation_order,station_from,station_to,bearing,distance,face,source_kind,retained_input FROM traverse_observations WHERE traverse_id=$1 ORDER BY observation_order,id LIMIT 2001',
    [r.traverseId],
  )
  if (
    coordinates.rows.length !== result.coordinates.length ||
    observations.rows.length !== result.rawObservations.length ||
    r.coordinateIds.length !== coordinates.rows.length ||
    r.observationIds.length !== observations.rows.length
  )
    throw fail('The retained canonical source set is incomplete.', 500)
  coordinates.rows.forEach((p, i) => {
    const expected = result.coordinates[i]
    if (
      p.id !== r.coordinateIds[i] ||
      p.coordinate_order !== i ||
      p.station_name !== expected.station ||
      Number(p.easting) !== expected.easting ||
      Number(p.northing) !== expected.northing ||
      (p.elevation === null ? undefined : Number(p.elevation)) !== expected.rl
    )
      throw fail('A retained coordinate changed or lost precision.', 500)
  })
  observations.rows.forEach((o, i) => {
    if (
      o.id !== r.observationIds[i] ||
      o.observation_order !== i ||
      o.station_from !== result.legs[i].from ||
      o.station_to !== result.legs[i].to ||
      o.bearing !== null ||
      o.distance !== null ||
      o.face !== 'FL_FR' ||
      o.source_kind !== 'paired_clockwise_angle' ||
      hash(o.retained_input) !== hash(result.rawObservations[i])
    )
      throw fail('A retained original observation changed.', 500)
  })
  return retainedTraverseSchema.parse({
    receipt: r,
    input: b,
    result,
    currentReferenceMatches:
      currentReference !== null && digest(currentReference) === r.referenceHash,
  })
}
async function priorRequest(
  client: PoolClient,
  actor: string,
  project: string,
  parcel: string,
  request: string,
  inputHash?: string,
): Promise<TraverseOutcome | null> {
  const row = (
    await client.query<{
      input_hash: string
      project_id: string
      parcel_id: string
      revision_id: string | null
      receipt: unknown
    }>(
      'SELECT input_hash,project_id,parcel_id,revision_id,receipt FROM parcel_traverse_requests WHERE actor_id=$1 AND request_id=$2',
      [actor, request],
    )
  ).rows[0]
  if (!row) return null
  if (
    row.project_id !== project ||
    row.parcel_id !== parcel ||
    (inputHash !== undefined && row.input_hash !== inputHash)
  )
    throw fail('This request ID already belongs to different intent or scope.')
  const parsed = traverseOutcomeSchema.safeParse(row.receipt)
  if (
    !parsed.success ||
    parsed.data.actorId !== actor ||
    parsed.data.requestId !== request ||
    parsed.data.projectId !== project ||
    parsed.data.parcelId !== parcel ||
    parsed.data.inputHash !== row.input_hash ||
    (parsed.data.state === 'committed' ? parsed.data.revisionId : null) !==
      row.revision_id
  )
    throw fail('The retained request acknowledgement is inconsistent.', 500)
  return parsed.data
}
export async function saveRetainedTraverse(
  actor: string,
  input: unknown,
  wireText?: string,
) {
  const b = command(input)
  ids(actor)
  if (actor !== b.expectedUserId)
    throw fail(
      'The account changed. The original device request was preserved.',
      403,
    )
  const inputHash = hash(b),
    originalText = wireText ?? canonicalJSON(b),
    originalHash = digest(originalText),
    source = sourceHash(b)
  let result: ReturnType<typeof computeRetainedTraverse>
  try {
    result = computeRetainedTraverse(b)
  } catch (error) {
    throw fail(
      error instanceof Error ? error.message : 'Invalid traverse observations.',
      400,
    )
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 8388608)
    throw fail(
      'The retained numerical result exceeds the 8 MiB revision window.',
      413,
    )
  if (hash(command(JSON.parse(originalText))) !== inputHash)
    throw fail('The request bytes disagree with the admitted command.', 400)
  return transaction(async (client) => {
    const f = await frame(client, actor, b.projectId, b.parcelId, true)
    const previous = await priorRequest(
      client,
      actor,
      b.projectId,
      b.parcelId,
      b.requestId,
      inputHash,
    )
    if (previous) {
      if (previous.state === 'cancelled')
        throw fail(
          'This retained request was cancelled. It cannot create a late duplicate.',
        )
      return checkedRevision(
        client,
        actor,
        b.projectId,
        b.parcelId,
        previous.revisionId,
        f.referenceRecord,
      )
    }
    validateFrame(f, b)
    if (b.derivedFromRevisionId) {
      const source = await checkedRevision(
        client,
        actor,
        b.projectId,
        b.parcelId,
        b.derivedFromRevisionId,
        f.referenceRecord,
      )
      if (!source.currentReferenceMatches)
        throw fail(
          'This source revision uses an earlier project reference. Adopt a reviewed transformation before deriving another revision.',
        )
    }
    const parent = b.baseRevisionId
      ? (
          await client.query<{ ordinal: number }>(
            'SELECT ordinal FROM parcel_traverse_revisions WHERE id=$1 AND project_id=$2 AND parcel_id=$3',
            [b.baseRevisionId, b.projectId, b.parcelId],
          )
        ).rows[0]
      : null
    if (b.baseRevisionId && !parent)
      throw fail('The retained parent revision is missing.')
    const ordinal = (parent?.ordinal ?? 0) + 1
    if (!Number.isSafeInteger(ordinal) || ordinal > 2147483646)
      throw fail('The retained revision sequence is exhausted.')
    const revisionId = randomUUID(),
      traverseId = randomUUID(),
      coordinateIds = result.coordinates.map(() => randomUUID()),
      observationIds = result.rawObservations.map(() => randomUUID())
    const created = (
      await client.query<{ created: string }>(
        `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created`,
      )
    ).rows[0]?.created
    if (!created || !f.referenceRecord)
      throw fail('The retained write clock/reference is unavailable.', 503)
    const receipt = traverseReceiptSchema.parse({
      state: 'committed',
      requestId: b.requestId,
      actorId: actor,
      projectId: b.projectId,
      parcelId: b.parcelId,
      inputHash,
      revisionId,
      traverseId,
      ordinal,
      engineVersion: TRAVERSE_ENGINE,
      sourceHash: source,
      resultHash: hash(result),
      referenceHash: digest(f.referenceRecord),
      requestHash: originalHash,
      coordinateIds,
      observationIds,
      createdAt: created,
      status: 'draft_unverified',
    })
    const saved = await client.query<{ id: string }>(
      `INSERT INTO parcel_traverses(id,project_id,parcel_id,traverse_name,traverse_type,version,status,retained_revision_id) VALUES($1,$2,$3,$4,$5,$6,'draft_unverified',$7) RETURNING id`,
      [
        traverseId,
        b.projectId,
        b.parcelId,
        b.name,
        result.isClosed ? 'controlled' : 'open',
        ordinal,
        revisionId,
      ],
    )
    if (saved.rows.length !== 1 || saved.rows[0].id !== traverseId)
      throw fail('The new traverse parent was not acknowledged.', 503)
    const points = result.coordinates.map((p, i) => ({
      id: coordinateIds[i],
      order: i,
      station: p.station,
      e: String(p.easting),
      n: String(p.northing),
      rl: p.rl ?? null,
    }))
    const pointRows = await client.query(
      `INSERT INTO traverse_coordinates(id,traverse_id,coordinate_order,station_name,easting,northing,elevation) SELECT x.id,$1,x.ord,x.station,x.e::numeric,x.n::numeric,x.rl FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,ord integer,station text,e text,n text,rl double precision) RETURNING id`,
      [
        traverseId,
        JSON.stringify(points.map(({ order, ...p }) => ({ ...p, ord: order }))),
      ],
    )
    if (pointRows.rows.length !== points.length)
      throw fail(
        'The coordinate set was not acknowledged. Nothing was committed.',
        503,
      )
    const originals = result.rawObservations.map((o, i) => ({
      id: observationIds[i],
      ord: i,
      from: result.legs[i].from,
      to: result.legs[i].to,
      input: o,
    }))
    const observationRows = await client.query(
      `INSERT INTO traverse_observations(id,traverse_id,observation_order,station_from,station_to,bearing,distance,face,source_kind,retained_input) SELECT x.id,$1,x.ord,x.station_from,x.station_to,NULL,NULL,'FL_FR','paired_clockwise_angle',x.input FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,ord integer,station_from text,station_to text,input jsonb) RETURNING id`,
      [
        traverseId,
        JSON.stringify(
          originals.map(({ from, to, ...o }) => ({
            ...o,
            station_from: from,
            station_to: to,
          })),
        ),
      ],
    )
    if (observationRows.rows.length !== originals.length)
      throw fail(
        'The original observation set was not acknowledged. Nothing was committed.',
        503,
      )
    const revision = await client.query<{ id: string }>(
      `INSERT INTO parcel_traverse_revisions(id,actor_id,request_id,project_id,parcel_id,traverse_id,ordinal,parent_revision_id,input_hash,result_hash,source_hash,reference_hash,request_hash,request_text,engine_version,input_snapshot,result_snapshot,reference_record,receipt,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19::jsonb,$20::timestamptz) RETURNING id`,
      [
        revisionId,
        actor,
        b.requestId,
        b.projectId,
        b.parcelId,
        traverseId,
        ordinal,
        b.baseRevisionId,
        inputHash,
        receipt.resultHash,
        source,
        receipt.referenceHash,
        originalHash,
        originalText,
        TRAVERSE_ENGINE,
        JSON.stringify(b),
        JSON.stringify(result),
        f.referenceRecord,
        JSON.stringify(receipt),
        created,
      ],
    )
    if (revision.rows.length !== 1 || revision.rows[0].id !== revisionId)
      throw fail(
        'The retained revision was not acknowledged. Nothing was committed.',
        503,
      )
    const journal = await client.query<{ receipt: unknown }>(
      `INSERT INTO parcel_traverse_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,revision_id,receipt) VALUES($1,$2,$3,$4,$5,'committed',$6,$7::jsonb) RETURNING receipt`,
      [
        actor,
        b.requestId,
        b.projectId,
        b.parcelId,
        inputHash,
        revisionId,
        JSON.stringify(receipt),
      ],
    )
    if (
      journal.rows.length !== 1 ||
      hash(journal.rows[0].receipt) !== hash(receipt)
    )
      throw fail(
        'The exact request receipt was not acknowledged. Nothing was committed.',
        503,
      )
    return checkedRevision(
      client,
      actor,
      b.projectId,
      b.parcelId,
      revisionId,
      f.referenceRecord,
    )
  })
}
export async function cancelRetainedTraverse(actor: string, input: unknown) {
  const parsed = cancelTraverseSchema.safeParse(input)
  if (!parsed.success)
    throw fail(
      'A valid scoped request and input hash are required for cancellation.',
      400,
    )
  const b = parsed.data
  ids(actor)
  if (actor !== b.expectedUserId)
    throw fail(
      'The account changed. The retained device intent was preserved.',
      403,
    )
  return transaction(async (client) => {
    const f = await frame(client, actor, b.projectId, b.parcelId, true)
    const previous = await priorRequest(
      client,
      actor,
      b.projectId,
      b.parcelId,
      b.requestId,
      b.inputHash,
    )
    if (previous) {
      if (previous.state === 'committed')
        await checkedRevision(
          client,
          actor,
          b.projectId,
          b.parcelId,
          previous.revisionId,
          f.referenceRecord,
        )
      return previous
    }
    const receipt = traverseOutcomeSchema.parse({
      state: 'cancelled',
      requestId: b.requestId,
      actorId: actor,
      projectId: b.projectId,
      parcelId: b.parcelId,
      inputHash: b.inputHash,
    })
    const saved = await client.query<{ receipt: unknown }>(
      `INSERT INTO parcel_traverse_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,receipt) VALUES($1,$2,$3,$4,$5,'cancelled',$6::jsonb) RETURNING receipt`,
      [
        actor,
        b.requestId,
        b.projectId,
        b.parcelId,
        b.inputHash,
        JSON.stringify(receipt),
      ],
    )
    if (
      saved.rows.length !== 1 ||
      hash(saved.rows[0].receipt) !== hash(receipt)
    )
      throw fail(
        'Cancellation was not acknowledged. Keep the original device intent.',
        503,
      )
    return receipt
  })
}
export async function readRetainedTraverse(
  actor: string,
  project: string,
  parcel: string,
  options: {
    revisionId?: string
    requestId?: string
    beforeOrdinal?: number
  } = {},
) {
  ids(
    actor,
    project,
    parcel,
    ...(options.revisionId ? [options.revisionId] : []),
    ...(options.requestId ? [options.requestId] : []),
  )
  return transaction(async (client) => {
    const f = await frame(client, actor, project, parcel)
    if (options.requestId) {
      const outcome = await priorRequest(
        client,
        actor,
        project,
        parcel,
        options.requestId,
      )
      if (!outcome)
        throw fail('No final receipt exists for this request and account.', 404)
      if (outcome.state === 'committed')
        await checkedRevision(
          client,
          actor,
          project,
          parcel,
          outcome.revisionId,
          f.referenceRecord,
        )
      return { outcome }
    }
    const rows = await client.query<{
      revisionId: string
      traverseId: string
      ordinal: number
      name: string
      createdAt: string
      status: string
    }>(
      `SELECT r.id "revisionId",r.traverse_id "traverseId",r.ordinal,t.traverse_name name,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') "createdAt",'draft_unverified'::text status FROM parcel_traverse_revisions r JOIN parcel_traverses t ON t.id=r.traverse_id WHERE r.project_id=$1 AND r.parcel_id=$2 AND ($3::integer IS NULL OR r.ordinal<$3) ORDER BY r.ordinal DESC LIMIT 25`,
      [project, parcel, options.beforeOrdinal ?? null],
    )
    const revisions = rows.rows.slice(0, 24),
      revision =
        options.revisionId ??
        (options.beforeOrdinal
          ? undefined
          : (f.context.latestRevisionId ?? undefined))
    return traverseReadSchema.shape.data.parse({
      context: f.context,
      revisions,
      beforeOrdinal: options.beforeOrdinal ?? null,
      nextBeforeOrdinal: rows.rows.length > 24 ? revisions[23].ordinal : null,
      hasMore: rows.rows.length > 24,
      selected: revision
        ? await checkedRevision(
            client,
            actor,
            project,
            parcel,
            revision,
            f.referenceRecord,
          )
        : null,
    })
  })
}

/** Bridge to reviewed boundary selection: retained coordinates keep their frame. */
export async function assertRetainedTraverseSource(
  actor: string,
  project: string,
  parcel: string,
  revision: string,
  referenceRecord: string | Record<string, unknown>,
  client?: PoolClient,
) {
  const work = async (c: PoolClient) => {
    const current = (
      await c.query<{ record: string }>(
        'SELECT to_jsonb(r)::text record FROM project_reference_systems r WHERE project_id=$1 FOR SHARE',
        [project],
      )
    ).rows[0]?.record
    if (
      !current ||
      hash(JSON.parse(current)) !==
        hash(
          typeof referenceRecord === 'string'
            ? JSON.parse(referenceRecord)
            : referenceRecord,
        )
    )
      throw fail('The source reference changed during review.')
    const selected = await checkedRevision(
      c,
      actor,
      project,
      parcel,
      revision,
      current,
    )
    if (!selected.currentReferenceMatches)
      throw fail(
        'The retained traverse uses an earlier reference declaration. Retain a reviewed new computation; do not relabel its coordinates.',
      )
    const versions = (
      await c.query<{ revisionVersion: string; requestVersion: string }>(
        `SELECT r.xmin::text "revisionVersion",q.xmin::text "requestVersion" FROM parcel_traverse_revisions r JOIN parcel_traverse_requests q ON q.actor_id=r.actor_id AND q.request_id=r.request_id WHERE r.id=$1 AND r.project_id=$2 AND r.parcel_id=$3 FOR SHARE OF r,q`,
        [revision, project, parcel],
      )
    ).rows[0]
    if (!versions)
      throw fail('The retained source edit tokens are missing.', 500)
    return { ...selected.receipt, ...versions }
  }
  return client ? work(client) : transaction(work)
}
