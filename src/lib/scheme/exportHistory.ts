import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { schemeExportAccess } from './exportCommands'
import { schemeExportHistorySchema } from './exportContract'
export async function readSchemeExportHistory(
  actor: string,
  project: string,
  page: number,
) {
  if (!Number.isInteger(page) || page < 1 || page > 999999)
    throw new AppError('Choose a valid export history page.', 400)
  const access = await schemeExportAccess(actor, project)
  if (!access.storageReady)
    throw new AppError('Retained scheme-export storage is unavailable.', 409)
  const result = await db.query<{ payload: unknown }>(
    `WITH owned AS(SELECT id FROM projects WHERE id=$1 AND user_id=$2),
 records AS(SELECT q.* FROM scheme_export_requests q JOIN owned p ON p.id=q.project_id WHERE q.actor_id=$2),
 page_rows AS(SELECT q.*,r.source_revision,r.deliverable_id,r.revision,d.id owned_deliverable FROM records q LEFT JOIN deliverable_revisions r ON r.id=q.deliverable_revision_id LEFT JOIN deliverables d ON d.id=r.deliverable_id AND d.project_id=q.project_id ORDER BY q.created_at DESC,q.id DESC LIMIT 24 OFFSET ($3::integer-1)*24)
 SELECT jsonb_build_object('projectId',o.id,'viewerId',$2::text,'page',$3::integer,'pageSize',24,'total',(SELECT COUNT(*) FROM records),'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('requestId',request_id,'format',format,'outcome',outcome,'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'parcelCount',jsonb_array_length(body->'parcelIds'),'sourceHash',body->>'sourceHash','sourceRevision',source_revision,'deliverableId',owned_deliverable,'revision',revision,'sourceCrs',receipt->>'sourceCrs') ORDER BY created_at DESC,id DESC) FROM page_rows),'[]'::jsonb)) payload FROM owned o`,
    [project, actor, page],
  )
  if (result.rows.length !== 1)
    throw new AppError('Project not found for this account.', 404)
  const parsed = schemeExportHistorySchema.safeParse(result.rows[0].payload)
  if (!parsed.success)
    throw new AppError(
      'The retained export history failed its identity or revision checks. Retry the read.',
      409,
    )
  return parsed.data
}
