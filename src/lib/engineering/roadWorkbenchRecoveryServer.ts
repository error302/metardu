import type { PoolClient } from 'pg'
import { z } from 'zod'
import { AppError } from '@/lib/api/errors'
import { EngineeringPayloadSchema } from '@/lib/validation/engineeringPayload'
import {loadRoadRetainedTerrain} from './roadTerrainServer'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import {
  hashDesignPayload,
  recordDesignRevision,
  type DesignRevisionRecord,
} from './designRevisions'
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
} from './roadWorkbenchDraft'
import { roadDesignDataSchema } from './roadDesignSchema'
import {
  roadWorkbenchCommandSchema,
  roadWorkbenchOutcomeSchema,
  roadWorkbenchSourceSchema,
  normalizedRoadJson,
  type RoadWorkbenchCommand,
  type RoadWorkbenchOutcome,
} from './roadWorkbenchRecoveryContract'
const ENTITY = 'road-workbench-request'
const fail = (message: string, status = 409) =>
  new AppError(message, status, 'ROAD_WORKBENCH_RECOVERY')
const scopeSchema = z.string().guid()
async function lockProject(
  client: PoolClient,
  actor: string,
  project: string,
  write: boolean,
) {
  scopeSchema.parse(actor)
  scopeSchema.parse(project)
  const { rows } = await client.query<{
    id: string
    user_id: string
    engineering_data: unknown
  }>(
    `SELECT id,user_id,engineering_data FROM projects WHERE id=$1 AND user_id=$2 FOR ${write ? 'UPDATE' : 'SHARE'}`,
    [project, actor],
  )
  if (rows.length !== 1) throw fail('Project not found for this account.', 404)
  return rows[0]
}
async function sourceFor(
  client: PoolClient,
  actor: string,
  project: string,
  engineering: unknown,
) {
  if (!EngineeringPayloadSchema.safeParse(engineering).success)
    throw fail(
      'The saved engineering data contains non-finite or unsupported JSON. Retain its original source before editing.',
      422,
    )
  const { rows: representable } = await client.query<{
    supported_json: boolean
  }>(
    'SELECT engineering_data = $3::jsonb AS supported_json FROM projects WHERE id=$1 AND user_id=$2',
    [project, actor, JSON.stringify(engineering)],
  )
  if (representable.length !== 1 || representable[0].supported_json !== true)
    throw fail(
      'The saved engineering JSON cannot be represented without precision loss. Its original data was preserved; review it before editing.',
      422,
    )
  const envelope = z
    .object({ mode: z.literal('road'), road: roadDesignDataSchema })
    .passthrough()
    .safeParse(engineering)
  if (!envelope.success)
    throw fail(
      'The complete saved road inputs need repair before recoverable editing.',
      422,
    )
  const { rows } = await client.query<Record<string, unknown>>(
    'SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE',
    [project],
  )
  const referenceRow = normalizedRoadJson(rows[0] ?? null)
  const resolved = resolveStageReference(referenceRow, {})
  const reference = {
    code: resolved.code,
    verticalDatum: resolved.verticalDatum,
    distanceMode: resolved.distanceMode,
  }
  return {
    source: roadWorkbenchSourceSchema.parse({
      version: 1,
      actorId: actor,
      projectId: project,
      engineeringHash: hashDesignPayload({
        engineering: normalizedRoadJson(engineering),
      }),
      referenceHash: hashDesignPayload({ reference: referenceRow }),
      road: envelope.data.road,
      reference,
    }),
    evidence: {
      engineering: normalizedRoadJson(z.record(z.string(), z.unknown()).parse(engineering)),
      referenceRecord: referenceRow,
    },
  }
}
export async function loadRoadWorkbenchSource(
  client: PoolClient,
  actor: string,
  project: string,
) {
  const row = await lockProject(client, actor, project, false)
  return (await sourceFor(client, actor, project, row.engineering_data)).source
}
interface JournalRow extends DesignRevisionRecord {
  payload: unknown
  created_by: string | null
}
const evidenceSchema = z
  .object({
    engineering: z.record(z.string(), z.unknown()),
    referenceRecord: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict()
async function findOutcome(
  client: PoolClient,
  actor: string,
  command: RoadWorkbenchCommand,
): Promise<RoadWorkbenchOutcome | null> {
  const { rows } = await client.query<JournalRow>(
    "SELECT * FROM design_revisions WHERE project_id=$1 AND discipline='road' AND entity_type=$2 AND entity_id=$3 ORDER BY revision_number LIMIT 2",
    [command.projectId, ENTITY, command.requestId],
  )
  if (!rows.length) return null
  if (rows.length !== 1)
    throw fail(
      'The retained request identity is ambiguous. Preserve it for recovery.',
    )
  const row = rows[0],
    payload = z
      .object({
        protocol: z.literal('road-workbench-request-v1'),
        request: roadWorkbenchCommandSchema,
        outcome: roadWorkbenchOutcomeSchema,
        sourceEvidence: evidenceSchema.nullable(),
      })
      .strict()
      .safeParse(row.payload)
  if (
    !payload.success ||
    row.created_by !== actor ||
    row.project_id !== command.projectId ||
    row.entity_id !== command.requestId ||
    row.entity_type !== ENTITY ||
    row.content_hash !==
      hashDesignPayload(row.payload as Record<string, unknown>)
  )
    throw fail('The retained road request failed its integrity identity check.')
  const requestHash = hashDesignPayload(command)
  if (
    hashDesignPayload(payload.data.request) !== requestHash ||
    payload.data.outcome.requestHash !== requestHash ||
    payload.data.outcome.actorId !== actor ||
    payload.data.outcome.projectId !== command.projectId ||
    payload.data.outcome.requestId !== command.requestId
  )
    throw fail(
      'This request identity belongs to different input. Preserve the original request.',
    )
  const result = payload.data.outcome
  if (
    result.state === 'committed' &&
    (result.roadHash !== hashDesignPayload({ road: result.road }) ||
      result.roadHash !== hashDesignPayload({ road: command.road }))
  )
    throw fail('The retained road outcome failed its integrity identity check.')
  if (result.state === 'committed') {
    const evidence = payload.data.sourceEvidence
    if (
      !evidence ||
      hashDesignPayload({ engineering: evidence.engineering }) !==
        command.expectedEngineeringHash ||
      hashDesignPayload({ reference: evidence.referenceRecord }) !==
        command.expectedReferenceHash ||
      hashDesignPayload({
        engineering: { ...evidence.engineering, road: command.road },
      }) !== result.engineeringHash
    )
      throw fail(
        'The retained source evidence failed its integrity identity check.',
      )
  }
  return result
}
function identity(actor: string, input: RoadWorkbenchCommand) {
  if (!EngineeringPayloadSchema.safeParse(input).success)
    throw fail(
      'The original road request must contain finite supported JSON values.',
      422,
    )
  const command = roadWorkbenchCommandSchema.parse(normalizedRoadJson(input))
  if (command.actorId !== actor)
    throw fail(
      'The request account changed. Recover it using the original account.',
      403,
    )
  return command
}
export async function readRoadWorkbenchOutcome(
  client: PoolClient,
  actor: string,
  input: RoadWorkbenchCommand,
) {
  const c = identity(actor, input)
  await lockProject(client, actor, c.projectId, false)
  return findOutcome(client, actor, c)
}
/** Caller owns the transaction. The project write and immutable final outcome commit or roll back together. */
export async function executeRoadWorkbenchCommand(
  client: PoolClient,
  actor: string,
  input: RoadWorkbenchCommand,
  operation: 'commit' | 'cancel',
) {
  const command = identity(actor, input),
    row = await lockProject(client, actor, command.projectId, true)
  const previous = await findOutcome(client, actor, command)
  if (previous) return previous
  const common = {
    version: 1 as const,
    actorId: actor,
    projectId: command.projectId,
    requestId: command.requestId,
    requestHash: hashDesignPayload(command),
  }
  let outcome: RoadWorkbenchOutcome
  let sourceEvidence: z.infer<typeof evidenceSchema> | null = null
  if (operation === 'cancel') outcome = { ...common, state: 'cancelled' }
  else {
    const { source, evidence } = await sourceFor(
      client,
      actor,
      command.projectId,
      row.engineering_data,
    )
    sourceEvidence = evidence
    if (
      source.engineeringHash !== command.expectedEngineeringHash ||
      source.referenceHash !== command.expectedReferenceHash
    )
      throw fail(
        'The saved engineering data or project reference changed. Your original request is retained; review the saved source before starting another.',
      )
    const retainedTerrain=command.road.retainedTerrain
      ? await loadRoadRetainedTerrain(client,actor,command.projectId,command.road.retainedTerrain.revisionId)
      : undefined
    const evaluated = evaluateRoadWorkbenchDraft(
      source.road,
      createRoadWorkbenchDraft(command.road),
      source.reference,
      retainedTerrain?.identity,
    )
    if (!evaluated.road) throw fail(evaluated.error, 422)
    if (
      hashDesignPayload({ road: normalizedRoadJson(evaluated.road) }) !==
      hashDesignPayload({ road: command.road })
    )
      throw fail(
        'The edited inputs do not preserve the original observations, source metadata or ground association.',
        422,
      )
    const original = z.record(z.string(), z.unknown()).parse(row.engineering_data),
      engineering = { ...original, road: command.road }
    const { rows } = await client.query<{
      id: string
      engineering_data: unknown
    }>(
      "UPDATE projects SET engineering_data=jsonb_set(engineering_data,'{road}',$3::jsonb,true) WHERE id=$1 AND user_id=$2 RETURNING id,engineering_data",
      [command.projectId, actor, JSON.stringify(command.road)],
    )
    if (
      rows.length !== 1 ||
      rows[0].id !== command.projectId ||
      hashDesignPayload({ engineering: rows[0].engineering_data }) !==
        hashDesignPayload({ engineering })
    )
      throw fail(
        'The database did not acknowledge the exact project and edited inputs.',
      )
    outcome = {
      ...common,
      state: 'committed',
      roadHash: hashDesignPayload({ road: command.road }),
      engineeringHash: hashDesignPayload({ engineering }),
      referenceHash: source.referenceHash,
      road: command.road,
      reference: source.reference,
    }
  }
  const payload = {
    protocol: 'road-workbench-request-v1',
    request: command,
    outcome,
    sourceEvidence,
  }
  await recordDesignRevision(
    {
      projectId: command.projectId,
      discipline: 'road',
      entityType: ENTITY,
      entityId: command.requestId,
      userId: actor,
      draftOnly: true,
      supersedeCurrent: false,
      summary:
        operation === 'cancel'
          ? 'Cancelled road draft request'
          : 'Retained road design draft',
      crs: command.road.coordinateSystem,
      payload,
    },
    client,
  )
  return outcome
}
