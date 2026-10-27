import type { BrowserClient } from '@/lib/api-client/client'
import type { EngineeringData, RoadDesignData } from '@/types/engineering'
import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { EngineeringPayloadSchema } from '@/lib/validation/engineeringPayload'

/** Omit optional object properties, but never coerce invalid numbers or array entries. */
export function engineeringDataSnapshot(input: EngineeringData): EngineeringData {
  const raw = JSON.stringify(input, function (this: unknown, _key: string, value: unknown) {
    if (value === undefined && !Array.isArray(this)) return undefined
    if ((typeof value === 'number' && !Number.isFinite(value)) ||
      ['undefined', 'bigint', 'function', 'symbol'].includes(typeof value)) {
      throw new Error('Engineering data must contain finite supported JSON values.')
    }
    return value
  })
  const snapshot: unknown = JSON.parse(raw)
  if (!EngineeringPayloadSchema.safeParse(snapshot).success) throw new Error('Engineering data exceeds the supported JSON format.')
  return snapshot as EngineeringData
}

/** The project JSON is the complete saved draft; legacy relational rows omit design/profile fields. */
export function hydrateSavedEngineeringRoad(
  current: EngineeringData,
  relationalRoad: RoadDesignData,
): EngineeringData {
  return { ...current, road: current.road ?? relationalRoad }
}

/** Persist engineering data and surface the API client's result-shaped errors. */
export async function saveProjectEngineeringData(
  client: Pick<BrowserClient, 'from'>,
  projectId: string,
  engineeringData: EngineeringData,
  originalSnapshot: EngineeringData | null,
): Promise<void> {
  if (originalSnapshot !== null && !EngineeringPayloadSchema.safeParse(originalSnapshot).success) {
    throw new Error('The originally loaded engineering snapshot is unavailable or invalid. Keep the draft and reopen the project for review.')
  }
  const snapshot = engineeringDataSnapshot(engineeringData)
  const query = client
    .from('projects')
    .update({ engineering_data: snapshot })
    .eq('id', projectId)
  const { data, error } = (await (originalSnapshot === null
    ? query.is('engineering_data', null)
    : query.eq('engineering_data', originalSnapshot))) as {
    data: unknown
    error: { message: string } | null
  }

  if (error) {
    throw new Error(`Engineering data was not saved: ${error.message}`)
  }

  // This project's query builder returns UPDATE ... RETURNING rows. A write
  // filtered out by ownership/RLS can be a successful SQL response with []
  // and no error, so require the project row to come back before confirming.
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      'Engineering data was not saved: the project was not updated. Refresh and check project access.',
    )
  }
  const acknowledged = z
    .object({ id: z.string(), engineering_data: z.unknown().optional() })
    .safeParse(data[0])
  if (
    !acknowledged.success ||
    acknowledged.data.id !== projectId ||
    canonicalJSON(acknowledged.data.engineering_data) !==
      canonicalJSON(snapshot)
  )
    throw new Error(
      'Engineering data save is unconfirmed: the response did not acknowledge the exact project and design. Keep the original draft and recover the saved project before retrying.',
    )
}
