import type { BrowserClient } from '@/lib/api-client/client'
import type { EngineeringData } from '@/types/engineering'

/** Persist engineering data and surface the API client's result-shaped errors. */
export async function saveProjectEngineeringData(
  client: Pick<BrowserClient, 'from'>,
  projectId: string,
  engineeringData: EngineeringData,
): Promise<void> {
  const { data, error } = await client
    .from('projects')
    .update({ engineering_data: engineeringData })
    .eq('id', projectId)

  if (error) {
    throw new Error(`Engineering data was not saved: ${error.message}`)
  }

  // This project's query builder returns UPDATE ... RETURNING rows. A write
  // filtered out by ownership/RLS can be a successful SQL response with []
  // and no error, so require the project row to come back before confirming.
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Engineering data was not saved: the project was not updated. Refresh and check project access.')
  }
}
