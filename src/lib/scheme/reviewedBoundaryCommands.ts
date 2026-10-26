import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { assertRetainedTraverseSource } from './traverseCommands'
import {
  boundaryCommandSchema,
  boundaryDirectorySchema,
  boundaryReceiptSchema,
  boundarySourceSchema,
  prepareBoundary,
  BOUNDARY_VERTEX_LIMIT,
  BOUNDARY_SOURCE_LIMIT,
  BOUNDARY_POINT_PAGE_SIZE,
  type BoundarySource,
} from './boundaryReview'

const hash = (value: unknown) =>
  createHash('sha256').update(canonicalJSON(value)).digest('hex')
const error = (message: string, status = 409) =>
  new AppError(message, status, 'BOUNDARY_REVIEW')
function identity(
  actor: string,
  project: string,
  parcel: string,
  traverse?: string,
) {
  if (
    ![actor, project, parcel, ...(traverse ? [traverse] : [])].every(
      (value) => z.string().uuid().safeParse(value).success,
    )
  )
    throw error(
      'Valid account, project, parcel and traverse identifiers are required.',
      400,
    )
}
// CTE projections retain system edit tokens explicitly; SELECT * omits xmin.
const checkedSourceSql = `WITH owned AS (SELECT id FROM projects WHERE id=$1 AND user_id=$2),
 p AS(SELECT p.*,p.xmin FROM parcels p JOIN owned o ON o.id=p.project_id WHERE p.id=$3),
 t AS(SELECT t.*,t.xmin FROM parcel_traverses t JOIN p ON p.id=t.parcel_id AND p.project_id=t.project_id WHERE t.id=$4),
 point_rows AS(SELECT c.id,to_jsonb(c)||jsonb_build_object('recordJson',to_jsonb(c)::text,'easting',c.easting::text,'northing',c.northing::text,'elevation',to_jsonb(c)->>'elevation','rl',to_jsonb(c)->>'rl','coordinateVersion',c.xmin::text) raw FROM traverse_coordinates c JOIN t ON t.id=c.traverse_id ORDER BY c.id LIMIT ${BOUNDARY_SOURCE_LIMIT + 1}),
 observation_rows AS(SELECT o.id,jsonb_build_object('record',to_jsonb(o),'rowVersion',o.xmin::text)::text raw FROM traverse_observations o JOIN t ON t.id=o.traverse_id ORDER BY o.id LIMIT 2001),
 payload_budget AS(SELECT 4096+COALESCE((SELECT SUM(octet_length(to_jsonb(raw)::text)) FROM observation_rows),0)+COALESCE((SELECT SUM(octet_length(raw::text)) FROM point_rows),0)+COALESCE((SELECT octet_length(to_jsonb(r)::text) FROM project_reference_systems r JOIN owned p ON p.id=r.project_id),0)+COALESCE((SELECT octet_length(to_jsonb(to_jsonb(t)::text)::text) FROM t),0) bytes)
 SELECT jsonb_build_object(
 'storageReady',to_regclass('parcel_boundary_drafts') IS NOT NULL,'projectId',p.project_id,'parcelId',p.id,'parcelNumber',p.parcel_number,'blockId',p.block_id,'parcelStatus',p.status,
 'parcelRevision',COALESCE(p.revision_number,0),'parcelVersion',p.xmin::text,'parcelUpdatedAt',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'confirmedLr',p.lr_number_confirmed,'geometryHash',encode(public.digest(public.ST_AsEWKB(p.geom),'sha256'),'hex'),'boundaryHash',encode(public.digest(p.boundary_geojson::text,'sha256'),'hex'),
 'traverseId',t.id,'traverseVersion',t.xmin::text,'traverseRecordJson',CASE WHEN (SELECT bytes<=4194304 FROM payload_budget) THEN to_jsonb(t)::text ELSE NULL END,
 'sourceBytes',(SELECT bytes FROM payload_budget),
 'reference',CASE WHEN (SELECT bytes<=4194304 FROM payload_budget) THEN (SELECT to_jsonb(r) FROM project_reference_systems r WHERE r.project_id=p.project_id) ELSE NULL END,
 'pointCount',(SELECT COUNT(*) FROM traverse_coordinates c WHERE c.traverse_id=t.id),
 'observationCount',(SELECT COUNT(*) FROM traverse_observations o WHERE o.traverse_id=t.id),
 'originalObservations',CASE WHEN (SELECT bytes<=4194304 FROM payload_budget) THEN COALESCE((SELECT jsonb_agg(raw ORDER BY id) FROM observation_rows),'[]'::jsonb) ELSE '[]'::jsonb END,
 'rawPoints',CASE WHEN (SELECT bytes<=4194304 FROM payload_budget) THEN COALESCE((SELECT jsonb_agg(raw ORDER BY id) FROM point_rows),'[]'::jsonb) ELSE '[]'::jsonb END) snapshot FROM p CROSS JOIN t`
const rawSchema = z.object({
  storageReady: z.boolean(),
  observationCount: z.number().int().nonnegative(),
  originalObservations: z.array(z.string()),
  sourceBytes: z.number().int().nonnegative(),
  projectId: z.string().uuid(),
  parcelId: z.string().uuid(),
  parcelNumber: z.string(),
  blockId: z.string().uuid().nullable(),
  parcelStatus: z.string().nullable(),
  parcelRevision: z.number().int().nonnegative(),
  parcelVersion: z.string(),
  parcelUpdatedAt: z.string(),
  confirmedLr: z.string().nullable(),
  geometryHash: z.string().nullable(),
  boundaryHash: z.string().nullable(),
  traverseId: z.string().uuid(),
  traverseVersion: z.string(),
  traverseRecordJson: z.string().nullable(),
  reference: z.record(z.unknown()).nullable(),
  pointCount: z.number().int().nonnegative(),
  rawPoints: z.array(z.record(z.unknown())),
  retainedEvidence: z.record(z.unknown()).optional(),
})
function number(value: unknown): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim()) ||
    !Number.isFinite(Number(value))
  )
    throw error('A retained boundary coordinate is unknown or nonfinite.')
  return Number(value)
}
function alias(row: Record<string, unknown>, current: string, legacy: string) {
  const a = row[current],
    b = row[legacy]
  if (
    a != null &&
    b != null &&
    (current === 'rl' ? number(a) !== number(b) : String(a) !== String(b))
  )
    throw error(
      'Historical and current traverse coordinate columns disagree. Review the source before continuing.',
    )
  return a ?? b ?? null
}
async function source(
  actor: string,
  project: string,
  parcel: string,
  traverse: string,
  client?: PoolClient,
) {
  identity(actor, project, parcel, traverse)
  const params = [project, actor, parcel, traverse]
  const result = client
    ? await client.query<{ snapshot: unknown }>(checkedSourceSql, params)
    : await db.query<{ snapshot: unknown }>(checkedSourceSql, params)
  if (result.rows.length !== 1)
    throw error('Parcel/traverse not found for this project and account.', 404)
  const parsed = rawSchema.safeParse(result.rows[0].snapshot)
  if (!parsed.success)
    throw error('The retained boundary source is inconsistent.', 500)
  const raw = parsed.data
  if (raw.sourceBytes > 4194304)
    throw error(
      'The retained boundary source exceeds the 4 MiB review window. Review a bounded source without discarding original records.',
      413,
    )
  if (raw.observationCount > 2000)
    throw error(
      'This source exceeds the 2,000-observation review window. Retain a bounded boundary source before continuing.',
      413,
    )
  if (raw.originalObservations.length !== raw.observationCount)
    throw error('The retained observation set changed during the read.')
  if (raw.pointCount > BOUNDARY_SOURCE_LIMIT)
    throw error(
      'This traverse exceeds the 2,001-coordinate source window. Retain a bounded source without discarding original records.',
      413,
    )
  if (raw.rawPoints.length !== raw.pointCount)
    throw error('The retained coordinate set changed during the read.')
  if (raw.traverseRecordJson) {
    const retained = z
      .object({ retained_revision_id: z.string().uuid().nullable().optional() })
      .parse(JSON.parse(raw.traverseRecordJson)).retained_revision_id
    if (retained) {
      if (!raw.reference)
        throw error('The retained traverse reference is missing.')
      raw.retainedEvidence = await assertRetainedTraverseSource(
        actor,
        project,
        parcel,
        retained,
        raw.reference,
        client,
      )
      if (Buffer.byteLength(canonicalJSON(raw), 'utf8') > 4194304)
        throw error(
          'The complete retained source exceeds the 4 MiB review window.',
          413,
        )
    }
  }
  let crs: string
  try {
    crs = assertProjectedCrs(
      typeof raw.reference?.horizontal_crs === 'string'
        ? raw.reference.horizontal_crs
        : '',
    ).code
  } catch {
    throw error(
      'Declare the projected project reference before reviewing a boundary.',
    )
  }
  const points = raw.rawPoints.map((row) => ({
    id: row.id,
    station: alias(row, 'station', 'station_name'),
    easting: number(row.easting),
    northing: number(row.northing),
    elevation:
      alias(row, 'rl', 'elevation') == null
        ? null
        : number(alias(row, 'rl', 'elevation')),
  }))
  const data = boundarySourceSchema.parse({
    ...raw,
    points,
    sourceCrs: crs,
    evidenceHash: hash(raw),
  })
  return { data, raw }
}
export async function readBoundarySource(
  actor: string,
  project: string,
  parcel: string,
  traverse: string,
  options: { page?: number; filter?: string } = {},
): Promise<BoundarySource> {
  const all = (await source(actor, project, parcel, traverse)).data
  if (
    options.page === undefined &&
    !options.filter &&
    all.points.length <= BOUNDARY_VERTEX_LIMIT
  )
    return all
  if (options.page === undefined)
    throw error(
      'Choose an explicit coordinate page to review or search this source. Original coordinates were not truncated.',
      400,
    )
  const page = options.page ?? 1,
    filter = (options.filter ?? '').trim()
  if (!Number.isSafeInteger(page) || page < 1 || filter.length > 80)
    throw error('Choose a valid coordinate page and label or ID filter.', 400)
  const normalized = filter.toLowerCase(),
    points = all.points.filter(
      (p) =>
        !normalized ||
        (p.station ?? '').toLowerCase().includes(normalized) ||
        p.id.toLowerCase().includes(normalized),
    )
  if (page > Math.max(1, Math.ceil(points.length / BOUNDARY_POINT_PAGE_SIZE)))
    throw error(
      'The requested coordinate page is outside the retained source.',
      400,
    )
  return boundarySourceSchema.parse({
    ...all,
    points: points.slice(
      (page - 1) * BOUNDARY_POINT_PAGE_SIZE,
      page * BOUNDARY_POINT_PAGE_SIZE,
    ),
    pointWindow: {
      page,
      pageSize: BOUNDARY_POINT_PAGE_SIZE,
      total: all.points.length,
      matchingCount: points.length,
      filter,
    },
  })
}
export async function readBoundaryReceipt(
  actor: string,
  project: string,
  parcel: string,
  request: string,
) {
  identity(actor, project, parcel)
  if (!z.string().uuid().safeParse(request).success)
    throw error('A valid boundary request ID is required.', 400)
  const result = await db.query<{
    id: string
    request_id: string
    parcel_id: string
    traverse_id: string
    input_hash: string
    evidence_hash: string
    receipt: unknown
  }>(
    `SELECT d.id,d.request_id,d.parcel_id,d.traverse_id,d.input_hash,d.evidence_hash,d.receipt FROM parcel_boundary_drafts d JOIN projects p ON p.id=d.project_id
    WHERE d.project_id=$1 AND p.user_id=$2 AND d.actor_id=$2 AND d.parcel_id=$3 AND d.request_id=$4`,
    [project, actor, parcel, request],
  )
  if (result.rows.length !== 1)
    throw error(
      'No retained draft receipt was found for this account, project, parcel and request.',
      404,
    )
  const row = result.rows[0],
    parsed = boundaryReceiptSchema.safeParse(row.receipt)
  if (
    !parsed.success ||
    parsed.data.receiptId !== row.id ||
    parsed.data.projectId !== project ||
    parsed.data.parcelId !== parcel ||
    parsed.data.requestId !== request ||
    parsed.data.traverseId !== row.traverse_id ||
    parsed.data.inputHash !== row.input_hash ||
    parsed.data.evidenceHash !== row.evidence_hash
  )
    throw error('The retained draft receipt is inconsistent.', 500)
  return parsed.data
}
export async function readBoundaryDirectory(
  actor: string,
  project: string,
  parcel: string,
  page = 1,
) {
  identity(actor, project, parcel)
  if (!Number.isInteger(page) || page < 1 || page > 999999)
    throw error('Choose a valid traverse page.', 400)
  const result = await db.query<{ directory: unknown }>(
    `WITH p AS(SELECT r.id,r.project_id,r.parcel_number FROM parcels r JOIN projects p ON p.id=r.project_id WHERE p.id=$1 AND p.user_id=$2 AND r.id=$3),
    candidates AS(SELECT t.id,t.traverse_name name,t.status FROM parcel_traverses t JOIN p ON p.id=t.parcel_id AND p.project_id=t.project_id),
    page_window AS(SELECT COUNT(*) total,LEAST($4::int,GREATEST(1,CEIL(COUNT(*)::numeric/24)::int)) page FROM candidates),
    rows AS(SELECT t.*,(SELECT COUNT(*) FROM traverse_coordinates c WHERE c.traverse_id=t.id) "pointCount" FROM candidates t ORDER BY t.id LIMIT 24 OFFSET(SELECT (page-1)*24 FROM page_window))
    SELECT jsonb_build_object('projectId',p.project_id,'parcelId',p.id,'parcelNumber',p.parcel_number,'page',w.page,'pageSize',24,'total',w.total,'traverses',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM rows r),'[]'::jsonb)) directory FROM p CROSS JOIN page_window w`,
    [project, actor, parcel, page],
  )
  if (result.rows.length !== 1)
    throw error('Parcel not found for this account and project.', 404)
  return boundaryDirectorySchema.parse(result.rows[0].directory)
}
function receipt(
  value: unknown,
  command: z.infer<typeof boundaryCommandSchema>,
  project: string,
  inputHash: string,
) {
  const parsed = boundaryReceiptSchema.safeParse(value)
  if (!parsed.success)
    throw error(
      'The exact boundary draft acknowledgement is invalid; no change was committed.',
      500,
    )
  const row = parsed.data
  if (
    row.projectId !== project ||
    row.parcelId !== command.parcel_id ||
    row.traverseId !== command.traverse_id ||
    row.requestId !== command.request_id ||
    row.inputHash !== inputHash ||
    row.evidenceHash !== command.evidence_hash ||
    row.sourceCrs !== command.source_crs ||
    canonicalJSON(row.orderedCoordinateIds) !==
      canonicalJSON(command.ordered_coordinate_ids)
  )
    throw error(
      'The boundary draft acknowledgement does not match the reviewed command.',
      500,
    )
  return row
}
export async function saveReviewedBoundary(
  actor: string,
  project: string,
  input: unknown,
) {
  const parsed = boundaryCommandSchema.safeParse(input)
  if (!parsed.success)
    throw error(
      'Review a parcel, source grid and distinct ordered vertices before saving.',
      400,
    )
  const command = parsed.data
  identity(actor, project, command.parcel_id, command.traverse_id)
  const inputHash = hash({
    protocol: 'reviewed-parcel-boundary-v1',
    project,
    command,
  })
  try {
    return await db.transaction(async (client) => {
      if (
        (
          await client.query(
            'SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR UPDATE',
            [project, actor],
          )
        ).rows.length !== 1
      )
        throw error('Project not found for this account.', 404)
      const previous = (
        await client.query<{ receipt: unknown; input_hash: string }>(
          'SELECT receipt,input_hash FROM parcel_boundary_drafts WHERE actor_id=$1 AND request_id=$2',
          [actor, command.request_id],
        )
      ).rows[0]
      if (previous) {
        if (previous.input_hash !== inputHash)
          throw error(
            'This request ID already belongs to a different boundary draft.',
          )
        return receipt(previous.receipt, command, project, inputHash)
      }
      if (
        (
          await client.query(
            'SELECT id FROM parcels WHERE id=$1 AND project_id=$2 FOR UPDATE',
            [command.parcel_id, project],
          )
        ).rows.length !== 1
      )
        throw error('Parcel not found for this project.', 404)
      await client.query(
        'SELECT id FROM project_reference_systems WHERE project_id=$1 FOR SHARE',
        [project],
      )
      if (
        (
          await client.query(
            'SELECT id FROM parcel_traverses WHERE id=$1 AND parcel_id=$2 AND project_id=$3 FOR UPDATE',
            [command.traverse_id, command.parcel_id, project],
          )
        ).rows.length !== 1
      )
        throw error('Traverse not found for this parcel.', 404)
      // FOR UPDATE on the referenced traverse also prevents new FK children until commit.
      await client.query(
        `SELECT id FROM traverse_coordinates WHERE traverse_id=$1 ORDER BY id LIMIT ${BOUNDARY_SOURCE_LIMIT + 1} FOR SHARE`,
        [command.traverse_id],
      )
      await client.query(
        'SELECT id FROM traverse_observations WHERE traverse_id=$1 ORDER BY id LIMIT 2001 FOR SHARE',
        [command.traverse_id],
      )
      const loaded = await source(
        actor,
        project,
        command.parcel_id,
        command.traverse_id,
        client,
      )
      if (loaded.data.evidenceHash !== command.evidence_hash)
        throw error(
          'The parcel, reference or traverse changed after review. Reload and review the current source.',
        )
      if (
        loaded.raw.confirmedLr ||
        !['pending', 'field_complete', 'computed'].includes(
          loaded.raw.parcelStatus ?? '',
        )
      )
        throw error(
          'This parcel retains an issued/confirmed or unrecognized state. Preserve it and use the reviewed revision workflow.',
        )
      let geometry: ReturnType<typeof prepareBoundary>
      try {
        geometry = prepareBoundary(
          loaded.data,
          command.ordered_coordinate_ids,
          command.source_crs,
        )
      } catch (failure) {
        throw error(
          failure instanceof Error
            ? failure.message
            : 'Invalid boundary draft.',
          400,
        )
      }
      const previousRows = await client.query<{
        ewkb: string | null
        boundary: unknown
        previous_area_ha: string | null
        oversized: boolean
      }>(
        "WITH prior AS(SELECT geom,boundary_geojson,area_ha,COALESCE(public.ST_MemSize(geom),0)::bigint*2+COALESCE(octet_length(boundary_geojson::text),0)>16777216 oversized FROM parcels WHERE id=$1) SELECT CASE WHEN NOT oversized THEN encode(public.ST_AsEWKB(geom),'hex') ELSE NULL END ewkb,CASE WHEN NOT oversized THEN boundary_geojson ELSE NULL END boundary,area_ha::text previous_area_ha,oversized FROM prior",
        [command.parcel_id],
      )
      if (previousRows.rows.length !== 1)
        throw error(
          'The prior parcel geometry could not be retained. No change was saved.',
          500,
        )
      const previousGeometry = previousRows.rows[0]
      if (previousGeometry.oversized)
        throw error(
          'The prior boundary exceeds the 16 MiB retention window. Preserve it through the large-artifact review workflow before replacement.',
          413,
        )
      const srid = Number(loaded.data.sourceCrs.replace(/^EPSG:/, ''))
      if (!Number.isInteger(srid) || srid <= 0)
        throw error(
          'The saved project CRS has no supported EPSG storage identifier.',
        )
      const changed = await client.query<{
        id: string
        project_id: string
        revision: number
        updated_at: string
        polygon: unknown
        srid: number
        area: string
        valid: boolean
        geometry_matches: boolean
      }>(
        `UPDATE parcels SET geom=public.ST_SetSRID(public.ST_GeomFromGeoJSON($1::text),$2),boundary_geojson=$1::jsonb,area_ha=$3,revision_number=COALESCE(revision_number,0)+1,updated_at=clock_timestamp()
      WHERE id=$4 AND project_id=$5 AND xmin::text=$6 RETURNING id,project_id,revision_number revision,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_at,boundary_geojson polygon,public.ST_SRID(geom) srid,area_ha::text area,public.ST_IsValid(geom) valid,public.ST_AsEWKB(geom)=public.ST_AsEWKB(public.ST_SetSRID(public.ST_GeomFromGeoJSON($1::text),$2)) geometry_matches`,
        [
          JSON.stringify(geometry.polygon),
          srid,
          geometry.areaHa,
          command.parcel_id,
          project,
          loaded.raw.parcelVersion,
        ],
      )
      const row = changed.rows[0]
      if (
        changed.rows.length !== 1 ||
        !row ||
        row.id !== command.parcel_id ||
        row.project_id !== project ||
        row.revision !== loaded.data.parcelRevision + 1 ||
        row.updated_at === loaded.raw.parcelUpdatedAt ||
        row.srid !== srid ||
        row.valid !== true ||
        row.geometry_matches !== true ||
        Number(row.area) !== geometry.areaHa ||
        canonicalJSON(row.polygon) !== canonicalJSON(geometry.polygon)
      )
        throw error(
          'The database did not acknowledge the exact boundary geometry. The complete draft was rolled back.',
          500,
        )
      const result = receipt(
        {
          ...geometry,
          protocol: 'reviewed-parcel-boundary-v1',
          receiptId: randomUUID(),
          requestId: command.request_id,
          projectId: project,
          parcelId: command.parcel_id,
          traverseId: command.traverse_id,
          evidenceHash: command.evidence_hash,
          inputHash,
          sourceCrs: command.source_crs,
          orderedCoordinateIds: command.ordered_coordinate_ids,
          parcelRevision: row.revision,
          parcelUpdatedAt: row.updated_at,
          status: 'draft_unverified',
        },
        command,
        project,
        inputHash,
      )
      const retained = await client.query<{ receipt: unknown }>(
        'INSERT INTO parcel_boundary_drafts(id,actor_id,request_id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING receipt',
        [
          result.receiptId,
          actor,
          command.request_id,
          project,
          command.parcel_id,
          command.traverse_id,
          inputHash,
          command.evidence_hash,
          JSON.stringify({
            source: loaded.raw,
            previousGeometry,
            review: {
              sourceCrs: command.source_crs,
              note: command.note,
              actor,
              orderedCoordinateIds: command.ordered_coordinate_ids,
            },
            geometry,
          }),
          JSON.stringify(result),
        ],
      )
      if (
        retained.rows.length !== 1 ||
        canonicalJSON(retained.rows[0].receipt) !== canonicalJSON(result)
      )
        throw error(
          'The retained draft receipt was not acknowledged. The complete draft was rolled back.',
          500,
        )
      return result
    })
  } catch (failure) {
    const code = z.object({ code: z.string() }).safeParse(failure)
    if (code.success && ['42P01', '42703'].includes(code.data.code))
      throw error(
        'Boundary draft storage requires the reviewed compatible schema. No change was saved.',
        503,
      )
    throw failure
  }
}
