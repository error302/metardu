import { z } from 'zod'
import type { PoolClient, QueryResultRow } from 'pg'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import {
  schemeBboxSchema,
  schemeExtentSchema,
  schemeViewportSchema,
  SCHEME_SHAPE_LIMIT,
  SCHEME_GROUP_LIMIT,
  SCHEME_VERTEX_LIMIT,
  SCHEME_GEOMETRY_BYTES,
  type SchemeViewQuery,
} from './schemeView'

const owned = `WITH owned AS (
 SELECT p.id,p.name,r.horizontal_crs,to_jsonb(r) reference,
 encode(public.digest(to_jsonb(r)::text,'sha256'),'hex') reference_hash,
 CASE WHEN r.horizontal_crs ~ '^EPSG:[0-9]{1,6}$' THEN split_part(r.horizontal_crs,':',2)::int ELSE NULL END srid
 FROM projects p LEFT JOIN project_reference_systems r ON r.project_id=p.id WHERE p.id=$1 AND p.user_id=$2
)`
const finiteBounds = (alias: string) =>
  `public.ST_XMin(${alias}.geom) BETWEEN -1e15 AND 1e15 AND public.ST_YMin(${alias}.geom) BETWEEN -1e15 AND 1e15 AND public.ST_XMax(${alias}.geom) BETWEEN -1e15 AND 1e15 AND public.ST_YMax(${alias}.geom) BETWEEN -1e15 AND 1e15`
const frame = `'projectId',c.id,'projectName',c.name,'crs',c.horizontal_crs,'referenceHash',c.reference_hash`
const unavailable = (message: string, status = 500) =>
  new AppError(message, status, 'SCHEME_VIEW')
function validateFrame(value: unknown) {
  const parsed = z.object({ crs: z.string().nullable() }).safeParse(value)
  let code: string
  try {
    code = assertProjectedCrs(
      parsed.success ? (parsed.data.crs ?? '') : '',
    ).code
  } catch {
    throw unavailable(
      'Declare a registered projected project reference before viewing stored parcel geometry.',
      409,
    )
  }
  if (
    !parsed.success ||
    parsed.data.crs !== code ||
    !/^EPSG:\d{1,6}$/.test(code)
  )
    throw unavailable(
      'Stored parcel geometry requires a canonical registered EPSG project reference.',
      409,
    )
}
function validateIdentity(actor: string, project: string) {
  if (
    ![actor, project].every(
      (value) => z.string().uuid().safeParse(value).success,
    )
  )
    throw unavailable('Valid account and project UUIDs are required.', 400)
}

export async function readSchemeExtent(actor: string, project: string) {
  validateIdentity(actor, project)
  const result = await db.query<{ payload: unknown }>(
    `${owned}, classified AS(
 SELECT p.geom,CASE WHEN p.geom IS NULL OR public.ST_IsEmpty(p.geom) THEN 'missing'
 WHEN public.ST_SRID(p.geom) IS DISTINCT FROM c.srid THEN 'other_reference'
 WHEN public.GeometryType(p.geom)<>'POLYGON' OR NOT(${finiteBounds('p')}) THEN 'unplottable' ELSE 'stored' END category
 FROM parcels p JOIN owned c ON c.id=p.project_id
 ), summary AS(SELECT COUNT(*) total,COUNT(*) FILTER(WHERE category='missing') missing,COUNT(*) FILTER(WHERE category='other_reference') other_reference,
 COUNT(*) FILTER(WHERE category='unplottable') unplottable,COUNT(*) FILTER(WHERE category='stored') stored,
 public.ST_Extent(CASE WHEN category='stored' THEN geom ELSE NULL END) bounds FROM classified)
 SELECT jsonb_build_object(${frame},'mode','extent','totalParcels',s.total,'geometryRecords',s.stored,'otherReferenceRecords',s.other_reference,
 'missingGeometry',s.missing,'unplottableGeometry',s.unplottable,'extent',CASE WHEN s.stored>0 THEN jsonb_build_array(public.ST_XMin(s.bounds)-1,public.ST_YMin(s.bounds)-1,public.ST_XMax(s.bounds)+1,public.ST_YMax(s.bounds)+1) ELSE NULL END) payload FROM owned c CROSS JOIN summary s`,
    [project, actor],
  )
  if (result.rows.length !== 1)
    throw unavailable('Project not found for this account.', 404)
  validateFrame(result.rows[0].payload)
  const parsed = schemeExtentSchema.safeParse(result.rows[0].payload)
  if (!parsed.success)
    throw unavailable(
      'Stored geometry extent/counts are inconsistent. Retry the read.',
    )
  return parsed.data
}

/** Compare immutable receipt/source edit tokens, without returning the raw source arrays. */
const reviewState = (retained:boolean)=>`CASE WHEN d.id IS NULL THEN 'unassessed_geometry'
 WHEN d.receipt->>'protocol' IS DISTINCT FROM 'reviewed-parcel-boundary-v1'
 OR d.receipt->>'evidenceHash' IS DISTINCT FROM d.evidence_hash OR d.receipt->>'inputHash' IS DISTINCT FROM d.input_hash OR d.receipt->>'requestId' IS DISTINCT FROM d.request_id::text
 OR d.receipt->>'receiptId' IS DISTINCT FROM d.id::text OR d.receipt->>'projectId' IS DISTINCT FROM p.project_id::text
 OR d.receipt->>'parcelId' IS DISTINCT FROM p.id::text OR d.receipt->>'sourceCrs' IS DISTINCT FROM c.horizontal_crs
 OR d.receipt->>'parcelRevision' IS DISTINCT FROM COALESCE(p.revision_number,0)::text
 OR d.receipt->>'parcelUpdatedAt' IS DISTINCT FROM to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
 OR p.xmin::text IS DISTINCT FROM d.draft_xmin OR d.snapshot->'source'->'reference' IS DISTINCT FROM c.reference
 OR public.ST_AsEWKB(p.geom) IS DISTINCT FROM public.ST_AsEWKB(public.ST_SetSRID(public.ST_GeomFromGeoJSON((d.receipt->'polygon')::text),public.ST_SRID(p.geom)))
 OR d.receipt->'polygon' IS DISTINCT FROM p.boundary_geojson
 OR t.id IS NULL OR t.xmin::text IS DISTINCT FROM ((d.snapshot->'source'->>'traverseRecordJson')::jsonb->>'xmin')
 ${retained?`OR (to_jsonb(t)->>'retained_revision_id' IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM parcel_traverse_revisions r JOIN parcel_traverse_requests q ON q.actor_id=r.actor_id AND q.request_id=r.request_id
   WHERE r.id::text=to_jsonb(t)->>'retained_revision_id' AND r.project_id=p.project_id AND r.parcel_id=p.id AND r.traverse_id=t.id
   AND r.xmin::text=d.snapshot#>>'{source,retainedEvidence,revisionVersion}' AND q.xmin::text=d.snapshot#>>'{source,retainedEvidence,requestVersion}'
   AND q.state='committed' AND q.revision_id=r.id))`:`OR to_jsonb(t)->>'retained_revision_id' IS NOT NULL`}
 THEN 'changed_since_review'
 WHEN jsonb_typeof(d.snapshot->'source'->'rawPoints') IS DISTINCT FROM 'array'
 OR jsonb_typeof(d.snapshot->'source'->'originalObservations') IS DISTINCT FROM 'array' THEN 'changed_since_review'
 WHEN (SELECT COUNT(*)::text FROM traverse_coordinates tc WHERE tc.traverse_id=t.id) IS DISTINCT FROM d.snapshot->'source'->>'pointCount'
 OR (SELECT COUNT(DISTINCT value->>'id')::text FROM jsonb_array_elements(d.snapshot->'source'->'rawPoints')) IS DISTINCT FROM d.snapshot->'source'->>'pointCount'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(d.snapshot->'source'->'rawPoints') s LEFT JOIN traverse_coordinates tc ON tc.id::text=s->>'id' AND tc.traverse_id=t.id WHERE tc.id IS NULL OR tc.xmin::text IS DISTINCT FROM s->>'coordinateVersion')
 OR (SELECT COUNT(*)::text FROM traverse_observations o WHERE o.traverse_id=t.id) IS DISTINCT FROM d.snapshot->'source'->>'observationCount'
 OR (SELECT COUNT(DISTINCT (value::jsonb->'record'->>'id'))::text FROM jsonb_array_elements_text(d.snapshot->'source'->'originalObservations')) IS DISTINCT FROM d.snapshot->'source'->>'observationCount'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.snapshot->'source'->'originalObservations') s LEFT JOIN traverse_observations o ON o.id::text=(s.value::jsonb->'record'->>'id') AND o.traverse_id=t.id WHERE o.id IS NULL OR o.xmin::text IS DISTINCT FROM s.value::jsonb->>'rowVersion')
 THEN 'changed_since_review' ELSE 'reviewed_draft' END`

export async function readSchemeViewport(
  actor: string,
  project: string,
  query: Exclude<SchemeViewQuery, { mode: 'extent' }>,
  selection?: string[],
  transactionClient?: PoolClient,
) {
  validateIdentity(actor, project)
  const parsedBox = schemeBboxSchema.safeParse(query.bbox)
  if (!parsedBox.success)
    throw unavailable('Choose a finite, increasing project-grid viewport.', 400)
  const bbox = parsedBox.data,
    span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1])
  if (
    !Number.isFinite(query.cellSize) ||
    query.cellSize < span / 100 ||
    query.cellSize > span
  )
    throw unavailable(
      'Choose a density cell between one hundredth of the view span and the full span.',
      400,
    )
  const sqlQuery = <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) =>
    transactionClient
      ? transactionClient.query<T>(text, params)
      : db.query<T>(text, params)
  const available = await sqlQuery<{ available: boolean;retained_available:boolean }>(
    "SELECT to_regclass('parcel_boundary_drafts') IS NOT NULL available,to_regclass('parcel_traverse_revisions') IS NOT NULL AND to_regclass('parcel_traverse_requests') IS NOT NULL retained_available",
  )
  if (
    available.rows.length !== 1 ||
    typeof available.rows[0].available !== 'boolean'
  )
    throw unavailable('Review history availability could not be checked.')
  const history = available.rows[0].available
  const join = history
    ? `LEFT JOIN LATERAL(SELECT d.*,d.xmin::text draft_xmin FROM parcel_boundary_drafts d WHERE d.project_id=p.project_id AND d.parcel_id=p.id
 ORDER BY CASE WHEN d.receipt->>'parcelRevision' ~ '^[0-9]{1,10}$' THEN (d.receipt->>'parcelRevision')::bigint ELSE NULL END DESC NULLS LAST,d.created_at DESC,d.id DESC LIMIT 1) d ON TRUE
 LEFT JOIN parcel_traverses t ON t.id=d.traverse_id AND t.parcel_id=p.id AND t.project_id=p.project_id`
    : `LEFT JOIN LATERAL(SELECT NULL::uuid id,NULL::jsonb receipt,NULL::jsonb snapshot,NULL::text draft_xmin) d ON TRUE`
  const state = history ? reviewState(available.rows[0].retained_available===true) : "'unassessed_geometry'::text"
  const result = await sqlQuery<{ payload: unknown }>(
    `${owned}, viewport AS MATERIALIZED(
 SELECT p.id,public.ST_XMin(p.geom) min_e,public.ST_YMin(p.geom) min_n,public.ST_XMax(p.geom) max_e,public.ST_YMax(p.geom) max_n
 FROM parcels p JOIN owned c ON c.id=p.project_id WHERE p.geom IS NOT NULL AND NOT public.ST_IsEmpty(p.geom) AND public.ST_SRID(p.geom)=c.srid
 AND ${selection ? 'p.id=ANY($8::uuid[])' : 'p.geom OPERATOR(public.&&) public.ST_MakeEnvelope($3,$4,$5,$6,c.srid)'} AND ${finiteBounds('p')}
 ), totals AS(SELECT COUNT(*) matching FROM viewport),
 page_ids AS(SELECT id FROM viewport WHERE (SELECT matching FROM totals)<=${SCHEME_SHAPE_LIMIT} ORDER BY id LIMIT ${SCHEME_SHAPE_LIMIT}),
 assessed AS(
 SELECT p.id,p.project_id,p.parcel_number,p.status,p.area_ha,COALESCE(p.revision_number,0) revision,p.updated_at,p.geom,
 b.id block_id,b.block_number,d.id receipt_id,d.receipt->'polygon' retained_polygon,
 CASE WHEN public.GeometryType(p.geom)='POLYGON' AND public.ST_IsValid(p.geom) AND public.ST_NPoints(p.geom)<=5000 AND public.ST_NPoints(p.geom)>3 THEN TRUE ELSE FALSE END valid,
 public.ST_NPoints(p.geom) vertices,public.ST_MemSize(p.geom) bytes,${state} evidence_state
 FROM page_ids ids JOIN parcels p ON p.id=ids.id JOIN owned c ON c.id=p.project_id
 LEFT JOIN blocks b ON b.id=p.block_id AND b.project_id=p.project_id ${join}
 ), budget AS(
 SELECT a.*,SUM(CASE WHEN valid THEN vertices ELSE 0 END) OVER(ORDER BY id) cumulative_vertices,
 SUM(CASE WHEN valid THEN bytes*5 ELSE 0 END) OVER(ORDER BY id) cumulative_bytes FROM assessed a
 ), polygon_features AS(
 SELECT id,jsonb_build_object('type','Feature','id',id,'geometry',CASE WHEN evidence_state='reviewed_draft' THEN retained_polygon ELSE public.ST_AsGeoJSON(geom,17,0)::jsonb END,'properties',jsonb_build_object('kind','parcel','parcelId',id,'parcelNumber',parcel_number,'blockId',block_id,'blockNumber',block_number,'recordedStatus',status,'suppliedAreaHa',area_ha::text,'gridAreaSqM',public.ST_Area(geom),
 'evidenceState',evidence_state,'receiptId',receipt_id,'evidenceHash',${history ? "(SELECT receipt->>'evidenceHash' FROM parcel_boundary_drafts WHERE id=budget.receipt_id)" : 'NULL::text'},'geometryHash',encode(public.digest(public.ST_AsEWKB(geom),'sha256'),'hex'),'revision',revision,'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'canSnap',evidence_state='reviewed_draft','assessment','unverified')) feature
 FROM budget WHERE valid AND cumulative_vertices<=${SCHEME_VERTEX_LIMIT} AND cumulative_bytes<=${SCHEME_GEOMETRY_BYTES}
 ), cell_members AS(
 SELECT FLOOR((((GREATEST(min_e,$3)+LEAST(max_e,$5))/2)-$3)/$7) col,FLOOR((((GREATEST(min_n,$4)+LEAST(max_n,$6))/2)-$4)/$7) row,
 (GREATEST(min_e,$3)+LEAST(max_e,$5))/2 e,(GREATEST(min_n,$4)+LEAST(max_n,$6))/2 n FROM viewport WHERE (SELECT matching FROM totals)>${SCHEME_SHAPE_LIMIT}
 ), cells AS(SELECT col,row,COUNT(*) count,AVG(e) e,AVG(n) n FROM cell_members GROUP BY col,row ORDER BY col,row LIMIT ${SCHEME_GROUP_LIMIT}),
 density_features AS(SELECT col,row,count,jsonb_build_object('type','Feature','geometry',jsonb_build_object('type','Point','coordinates',jsonb_build_array(e,n)),
 'properties',jsonb_build_object('kind','density','count',count,'extent',jsonb_build_array($3+col*$7,$4+row*$7,$3+(col+1)*$7,$4+(row+1)*$7),'displayOnly',TRUE)) feature FROM cells),
 drawn AS(SELECT CASE WHEN t.matching>${SCHEME_SHAPE_LIMIT} THEN COALESCE((SELECT SUM(count) FROM density_features),0) ELSE (SELECT COUNT(*) FROM polygon_features) END represented FROM totals t)
 SELECT jsonb_build_object(${frame},'type','FeatureCollection','mode',CASE WHEN t.matching>${SCHEME_SHAPE_LIMIT} THEN 'density' ELSE 'polygons' END,
 'bbox',${selection ? 'NULL::jsonb' : 'jsonb_build_array($3,$4,$5,$6)'},'selection',${selection ? 'to_jsonb($8::uuid[])' : 'NULL::jsonb'},'matchingRecords',t.matching,'representedRecords',s.represented,'omittedRecords',t.matching-s.represented,'partial',s.represented<t.matching,'history',${history ? "'available'" : "'unavailable'"},
 'features',CASE WHEN t.matching>${SCHEME_SHAPE_LIMIT} THEN COALESCE((SELECT jsonb_agg(feature ORDER BY col,row) FROM density_features),'[]'::jsonb) ELSE COALESCE((SELECT jsonb_agg(feature ORDER BY id) FROM polygon_features),'[]'::jsonb) END) payload FROM owned c CROSS JOIN totals t CROSS JOIN drawn s`,
    [
      project,
      actor,
      ...bbox,
      query.cellSize,
      ...(selection ? [selection] : []),
    ],
  )
  if (result.rows.length !== 1)
    throw unavailable('Project not found for this account.', 404)
  validateFrame(result.rows[0].payload)
  const parsed = schemeViewportSchema.safeParse(result.rows[0].payload)
  if (!parsed.success)
    throw unavailable(
      'Stored geometry view failed identity, evidence or count validation. Retry the read.',
    )
  return parsed.data
}
export async function readSchemeSelection(
  actor: string,
  project: string,
  input: unknown,
  transactionClient?: PoolClient,
) {
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(SCHEME_SHAPE_LIMIT)
    .refine((value) => new Set(value).size === value.length)
    .safeParse(input)
  if (!ids.success)
    throw unavailable(
      'Choose 1–50 distinct parcel IDs for the draft export.',
      400,
    )
  const view = await readSchemeViewport(
    actor,
    project,
    { bbox: [0, 0, 1, 1], cellSize: 1 },
    ids.data,
    transactionClient,
  )
  if (
    view.matchingRecords !== ids.data.length ||
    view.features.length !== ids.data.length ||
    view.mode !== 'polygons' ||
    view.partial
  )
    throw unavailable(
      'The exact selected geometry is missing, invalid, oversized or uses another reference. No partial export was generated.',
      409,
    )
  return view
}
