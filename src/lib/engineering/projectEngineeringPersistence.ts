import type { BrowserClient } from '@/lib/api-client/client'
import type { EngineeringData, RoadDesignData } from '@/types/engineering'
import { z } from 'zod'
import { canonicalJSON } from '@/lib/audit/auditHash'

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
): Promise<void> {
  const { data, error } = (await client
    .from('projects')
    .update({ engineering_data: engineeringData })
    .eq('id', projectId)) as {
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
    .object({ id: z.string(), engineering_data: z.unknown() })
    .safeParse(data[0])
  if (
    !acknowledged.success ||
    acknowledged.data.id !== projectId ||
    canonicalJSON(acknowledged.data.engineering_data) !==
      canonicalJSON(JSON.parse(JSON.stringify(engineeringData)))
  )
    throw new Error(
      'Engineering data save is unconfirmed: the response did not acknowledge the exact project and design. Keep the original draft and recover the saved project before retrying.',
    )
}
