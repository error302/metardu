import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { schemeOverviewQuerySchema, schemeOverviewSchema, SCHEME_OVERVIEW_PAGE_SIZE } from './overview'

/** One MVCC statement binds owner, totals and bounded rows to the same snapshot. */
export async function readSchemeOverview(projectId: string, actorId: string, input: unknown) {
  const identity = z.object({ projectId: z.string().uuid(), actorId: z.string().uuid() }).safeParse({ projectId, actorId })
  const query = schemeOverviewQuerySchema.safeParse(input)
  if (!identity.success || !query.success) throw new AppError('A valid project UUID and positive page numbers are required.', 400, 'SCHEME_OVERVIEW_INPUT')
  const size = SCHEME_OVERVIEW_PAGE_SIZE
  const result = await db.query<{ data: unknown }>(`
    WITH owned_project AS (
      SELECT id,name,location,project_type FROM projects WHERE id=$1 AND user_id=$2
    ), project_blocks AS (
      SELECT b.id,b.block_number,b.block_name FROM blocks b JOIN owned_project p ON p.id=b.project_id
    ), project_parcels AS (
      SELECT r.block_id,r.status FROM parcels r JOIN owned_project p ON p.id=r.project_id
    ), parcel_totals AS (
      SELECT COUNT(*) total,
        COUNT(*) FILTER(WHERE status='pending') pending,
        COUNT(*) FILTER(WHERE status='field_complete') field_complete,
        COUNT(*) FILTER(WHERE status='computed') computed,
        COUNT(*) FILTER(WHERE status='plan_generated') plan_generated,
        COUNT(*) FILTER(WHERE status='submitted') submitted,
        COUNT(*) FILTER(WHERE status='approved') approved,
        COUNT(*) FILTER(WHERE status IS NULL OR status NOT IN('pending','field_complete','computed','plan_generated','submitted','approved')) unrecognized,
        COUNT(*) FILTER(WHERE block_id IS NULL) unassigned,
        COUNT(*) FILTER(WHERE block_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_blocks b WHERE b.id=block_id)) invalid_block
      FROM project_parcels
    ), block_totals AS (
      SELECT COUNT(*) total FROM project_blocks
    ), block_window AS (
      SELECT total,LEAST($3::integer,GREATEST(1,CEIL(total::numeric/${size})::integer)) page FROM block_totals
    ), block_parcels AS (
      SELECT block_id,COUNT(*) total,COUNT(*) FILTER(WHERE status IN('submitted','approved')) submitted_or_approved
      FROM project_parcels GROUP BY block_id
    ), block_page AS (
      SELECT b.id,b.block_number,b.block_name,COALESCE(c.total,0) total,COALESCE(c.submitted_or_approved,0) submitted_or_approved
      FROM project_blocks b LEFT JOIN block_parcels c ON c.block_id=b.id
      ORDER BY b.block_number,b.id LIMIT ${size} OFFSET (SELECT (page-1)*${size} FROM block_window)
    ), project_traverses AS (
      SELECT t.id,t.traverse_name,t.method,t.status,t.updated_at FROM traverse_results t JOIN owned_project p ON p.id=t.project_id
    ), traverse_totals AS (
      SELECT COUNT(*) total,COUNT(*) FILTER(WHERE status IN('computed','approved')) computed FROM project_traverses
    ), traverse_window AS (
      SELECT total,computed,LEAST($4::integer,GREATEST(1,CEIL(total::numeric/${size})::integer)) page FROM traverse_totals
    ), traverse_page AS (
      SELECT * FROM project_traverses ORDER BY updated_at DESC NULLS LAST,id DESC
      LIMIT ${size} OFFSET (SELECT (page-1)*${size} FROM traverse_window)
    ), traverse_metrics AS (
      SELECT t.*,jsonb_build_object(
        'precision_ratio',CASE WHEN jsonb_typeof(stored.results->'precision_ratio') IN('number','string') THEN
          CASE WHEN char_length(stored.results->>'precision_ratio')<=64 THEN stored.results->'precision_ratio' ELSE 'null'::jsonb END ELSE 'null'::jsonb END,
        'computed_area_ha',CASE WHEN jsonb_typeof(stored.results->'computed_area_ha') IN('number','string') THEN
          CASE WHEN char_length(stored.results->>'computed_area_ha')<=64 THEN stored.results->'computed_area_ha' ELSE 'null'::jsonb END ELSE 'null'::jsonb END,
        'accuracy_order',CASE WHEN jsonb_typeof(stored.results->'accuracy_order')='string' THEN
          CASE WHEN char_length(stored.results->>'accuracy_order')<=200 THEN stored.results->'accuracy_order' ELSE 'null'::jsonb END ELSE 'null'::jsonb END
      ) results FROM traverse_page t JOIN traverse_results stored ON stored.id=t.id AND stored.project_id=$1
    )
    SELECT jsonb_build_object(
      'project',jsonb_build_object('id',p.id,'name',p.name,'location',p.location,'projectType',p.project_type),
      'parcels',jsonb_build_object('total',pt.total,'statusCounts',jsonb_build_object('pending',pt.pending,'field_complete',pt.field_complete,'computed',pt.computed,'plan_generated',pt.plan_generated,'submitted',pt.submitted,'approved',pt.approved),'unrecognized',pt.unrecognized,'unassignedBlock',pt.unassigned,'invalidBlock',pt.invalid_block),
      'blocks',jsonb_build_object('total',bw.total,'page',bw.page,'pageSize',${size},'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'blockNumber',b.block_number,'name',b.block_name,'parcelCount',b.total,'submittedOrApproved',b.submitted_or_approved) ORDER BY b.block_number,b.id) FROM block_page b),'[]'::jsonb)),
      'traverses',jsonb_build_object('total',tw.total,'computed',tw.computed,'page',tw.page,'pageSize',${size},'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.traverse_name,'method',t.method,'status',t.status,'updatedAt',t.updated_at,'results',t.results) ORDER BY t.updated_at DESC NULLS LAST,t.id DESC) FROM traverse_metrics t),'[]'::jsonb))
    ) data FROM owned_project p CROSS JOIN parcel_totals pt CROSS JOIN block_window bw CROSS JOIN traverse_window tw`, [projectId, actorId, query.data.block_page, query.data.traverse_page])
  if (!result.rows.length) throw new AppError('Scheme project not found for this account.', 404, 'SCHEME_OVERVIEW_PROJECT')
  const raw = z.object({ project: z.object({ projectType: z.string().nullable() }).passthrough(), traverses: z.object({ rows: z.array(z.record(z.unknown())) }).passthrough() }).passthrough().safeParse(result.rows[0].data)
  if (!raw.success) throw new AppError('The scheme overview response is incomplete.', 500, 'SCHEME_OVERVIEW_RESPONSE')
  if (raw.data.project.projectType !== 'scheme') throw new AppError('This project does not have a scheme workspace.', 409, 'SCHEME_OVERVIEW_TYPE')
  const finiteMetric = (value: unknown, allowZero: boolean) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return null
    const number = Number(value)
    return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) ? number : null
  }
  const rows = raw.data.traverses.rows.map(row => {
    const metrics = z.record(z.unknown()).safeParse(row.results)
    const values = metrics.success ? metrics.data : {}
    return { ...row, precisionRatio: finiteMetric(values.precision_ratio, false), areaHa: finiteMetric(values.computed_area_ha, true), recordedOrder: typeof values.accuracy_order === 'string' ? values.accuracy_order : null, assessment: 'unassessed' }
  })
  const parsed = schemeOverviewSchema.safeParse({ ...raw.data, traverses: { ...raw.data.traverses, rows } })
  if (!parsed.success) throw new AppError('The scheme overview counts or records are inconsistent. Retry the read.', 500, 'SCHEME_OVERVIEW_RESPONSE')
  return parsed.data
}
