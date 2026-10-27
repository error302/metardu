import type { PoolClient } from 'pg'
import type { OwnedAlignment } from './alignmentAccess'
import { EngineeringPayloadSchema } from '@/lib/validation/engineeringPayload'
import { AppError } from '@/lib/api/errors'
import { hashDesignPayload } from './designRevisions'

/** Caller already holds the project lock. A checked mirror never becomes a project writer. */
export async function verifyAlignmentMirrorSnapshot(client: PoolClient, alignment: Pick<OwnedAlignment,'project_id'>, expectedHash?: string): Promise<boolean> {
  const {rows}=await client.query<{engineering_data:unknown}>('SELECT engineering_data FROM projects WHERE id=$1',[alignment.project_id])
  if(rows.length!==1) throw new AppError('The original alignment project is unavailable. Keep the inputs and review project access.',404,'ENGINEERING_PROJECT_NOT_FOUND')
  const engineering=rows[0]?.engineering_data
  if(expectedHash === undefined) {
    if(engineering === null) return false
    throw new AppError('This project has a saved engineering draft. Use the project input workflow or visual workspace to edit it; mirror copies require the exact saved snapshot.',409,'ENGINEERING_SNAPSHOT_REQUIRED')
  }
  if(!EngineeringPayloadSchema.safeParse(engineering).success || hashDesignPayload({engineering})!==expectedHash) {
    throw new AppError('The saved engineering project changed. The delayed mirror copy was refused; retain the saved draft and review the latest project.',409,'ENGINEERING_MIRROR_CONFLICT')
  }
  return true
}

/** Legacy call boundary: project JSON is written only by conditional project commands. */
export async function syncAlignmentProjectInputs(client: PoolClient, alignment: OwnedAlignment, _section: 'ips' | 'vips' | 'stations', _rows: Record<string, unknown>[], mirrorOnly = false) {
  if(mirrorOnly) return
  await verifyAlignmentMirrorSnapshot(client,alignment)
}
