import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import {
  blockDirectoryQuerySchema,
  blockDirectoryResponseSchema,
  BLOCK_DIRECTORY_PAGE_SIZE,
} from './blockDirectory'

export async function readBlockDirectory(
  actor: string,
  projectId: string,
  input: unknown,
) {
  const identity = z
      .object({ actor: z.string().guid(), projectId: z.string().guid() })
      .safeParse({ actor, projectId }),
    query = blockDirectoryQuerySchema.safeParse(input)
  if (!identity.success || !query.success)
    throw new AppError(
      'Valid project UUID and block filters are required.',
      400,
      'BLOCK_DIRECTORY_INPUT',
    )
  const availability = await db.query<{ available: boolean }>(
    "SELECT to_regclass('scheme_import_receipts') IS NOT NULL available",
  )
  if (
    availability.rows.length !== 1 ||
    typeof availability.rows[0].available !== 'boolean'
  )
    throw new AppError(
      'The block retention check is unavailable.',
      503,
      'BLOCK_DIRECTORY_RETENTION',
    )
  const receipts = availability.rows[0].available,
    { page, q } = query.data,
    size = BLOCK_DIRECTORY_PAGE_SIZE,
    pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  // Only a checked schema-availability boolean selects these fixed fragments.
  const receiptExpression = receipts
    ? 'EXISTS(SELECT 1 FROM scheme_import_receipts r WHERE r.block_id=b.id)'
    : 'NULL::boolean'
  const result = await db.query<{ directory: unknown }>(
    `WITH owned_project AS (
    SELECT id,name,project_type FROM projects WHERE id=$1 AND user_id=$2
  ), project_blocks AS (
    SELECT b.id,b.block_number,b.block_name FROM blocks b JOIN owned_project p ON p.id=b.project_id
  ), project_parcels AS (
    SELECT r.block_id,r.status FROM parcels r JOIN owned_project p ON p.id=r.project_id
  ), parcel_counts AS (
    SELECT block_id,COUNT(*) total,COUNT(*) FILTER(WHERE status IN('submitted','approved')) completed FROM project_parcels GROUP BY block_id
  ), summary AS (
    SELECT (SELECT COUNT(*) FROM project_blocks) blocks,COUNT(*) parcels,COUNT(*) FILTER(WHERE status IN('submitted','approved')) completed,
      COUNT(*) FILTER(WHERE block_id IS NULL) unassigned,COUNT(*) FILTER(WHERE block_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_blocks b WHERE b.id=block_id)) invalid_links FROM project_parcels
  ), filtered AS (
    SELECT * FROM project_blocks WHERE $3='' OR block_number ILIKE $4 ESCAPE E'\\\\' OR COALESCE(block_name,'') ILIKE $4 ESCAPE E'\\\\'
  ), page_window AS (
    SELECT COUNT(*) total,LEAST($5::integer,GREATEST(1,CEIL(COUNT(*)::numeric/${size})::integer)) page FROM filtered
  ), page_ids AS (
    SELECT id FROM filtered ORDER BY block_number COLLATE "C",id LIMIT ${size} OFFSET(SELECT (page-1)*${size} FROM page_window)
  ), page_rows AS (
    SELECT b.id,b.project_id,b.block_number,b.block_name,b.description,b.created_at,
      to_char(b.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_at,b.xmin::text row_version,
      COALESCE(c.total,0) parcel_count,COALESCE(c.completed,0) completed_count,
      (SELECT COUNT(*) FROM block_assignments a WHERE a.block_id=b.id) assignment_count,
      ${receiptExpression} has_import_receipts,b.geom IS NOT NULL has_geometry
    FROM page_ids ids JOIN blocks b ON b.id=ids.id AND b.project_id=$1 LEFT JOIN parcel_counts c ON c.block_id=b.id
  ) SELECT jsonb_build_object(
    'project',jsonb_build_object('id',p.id,'name',p.name,'projectType',p.project_type,'canCreate',COALESCE(p.project_type='scheme',FALSE)),
    'summary',jsonb_build_object('blocks',s.blocks,'parcels',s.parcels,'submittedOrApproved',s.completed,'unassignedParcels',s.unassigned,'invalidBlockLinks',s.invalid_links,'receiptRetention',${receipts ? "'available'" : "'unavailable'"}),
    'meta',jsonb_build_object('page',w.page,'pageSize',${size},'total',w.total,'search',$3::text),
    'data',COALESCE((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('can_delete',${receipts ? 'TRUE' : 'FALSE'} AND b.has_import_receipts=FALSE AND NOT b.has_geometry AND b.parcel_count=0 AND b.assignment_count=0) ORDER BY b.block_number COLLATE "C",b.id) FROM page_rows b),'[]'::jsonb)
  ) directory FROM owned_project p CROSS JOIN summary s CROSS JOIN page_window w`,
    [projectId, actor, q, pattern, page],
  )
  if (result.rows.length !== 1)
    throw new AppError(
      'Project not found for this account.',
      404,
      'BLOCK_DIRECTORY_SCOPE',
    )
  const parsed = blockDirectoryResponseSchema.safeParse(
    result.rows[0].directory,
  )
  if (!parsed.success)
    throw new AppError(
      'The block directory counts or records are inconsistent. Retry the read.',
      500,
      'BLOCK_DIRECTORY_RESPONSE',
    )
  return parsed.data
}
