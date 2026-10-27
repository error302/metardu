import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { beaconInputSchema } from '@/lib/validation/apiValidation'
import { AppError } from '@/lib/api/errors'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { assertProjectedCrs, resolveEpsg, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store' }
const finiteQuery = z.string().trim().min(1).transform(Number).refine(Number.isFinite)
const querySchema = z.object({
  q: z.string().max(100).optional(), county: z.string().max(100).optional(), beacon_type: z.string().max(50).optional(),
  easting: finiteQuery.optional(), northing: finiteQuery.optional(), crs: z.string().trim().min(1).max(80).optional(),
  radius: finiteQuery.pipe(z.number().min(0).max(100000)).prefault('500'),
  limit: finiteQuery.pipe(z.number().int().min(1).max(200)).prefault('50'),
})
interface RegistryRow {
  id: string; beacon_number: string; easting: number; northing: number; elevation: number | null;
  horizontal_crs: string | null; project_id: string | null; owned: boolean; distance_m?: number;
}
const columns = (ownerParameter: number) => `id,beacon_number,beacon_type,easting,northing,elevation,utm_zone,datum,horizontal_crs,
  county,sub_county,locality,sheet_number,condition,description,is_adopted,source,sigma_e,sigma_n,sigma_rl,
  source_confidence,latitude,longitude,last_verified_at,created_at,status,superseded_by_id,
  metadata->'reference'->>'verticalDatum' AS vertical_datum,
  CASE WHEN created_by=$${ownerParameter}::uuid THEN project_id ELSE NULL END AS project_id,
  COALESCE(created_by=$${ownerParameter}::uuid,false) AS owned`
function fail(message: string, status: number): never { throw new AppError(message, status, 'BEACON_REGISTRY') }

export const GET = apiHandler({ auth: true, rateLimit: { max: 120, windowMs: 60000 } }, async (req, ctx) => {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid registry search parameters', issues: parsed.error.issues }, { status: 400 })
  const query = parsed.data, near = query.easting !== undefined || query.northing !== undefined
  if (near && (query.easting === undefined || query.northing === undefined || !query.crs)) fail('Nearby searches require easting, northing and their projected grid', 400)
  const values: unknown[] = [], clauses = ["status <> 'SUPERSEDED'", 'superseded_by_id IS NULL']
  const bind = (value: unknown): string => { values.push(value); return `$${values.length}` }
  if (query.q) clauses.push(`beacon_number ILIKE ${bind(`%${query.q}%`)}`)
  if (query.county) clauses.push(`county ILIKE ${bind(`%${query.county}%`)}`)
  if (query.beacon_type) clauses.push(`beacon_type=${bind(query.beacon_type)}`)
  let distance = '', ordering = 'beacon_number, id', crs: string | undefined
  if (near) {
    const e = query.easting as number, n = query.northing as number
    try {
      const info = assertProjectedCrs(query.crs as string)
      if (info.units !== 'metres') fail('Nearby search requires projected metre coordinates', 400)
      crs = info.code
      const range = validateCoordinateRange(e, n, crs)
      if (!range.valid) fail(range.errors.join('; '), 400)
    } catch (error) { if (error instanceof AppError) throw error; return fail('Select a registered projected survey grid', 400) }
    clauses.push(`horizontal_crs=${bind(crs)}`, "condition='good'")
    const ep = bind(e), np = bind(n), rp = bind(query.radius)
    // Bounding-box predicates use the coordinate index; exact planar distance
    // applies before the limit. No rounded center or stale response is reused.
    clauses.push(`easting BETWEEN ${ep}::double precision-${rp}::double precision AND ${ep}::double precision+${rp}::double precision`,
      `northing BETWEEN ${np}::double precision-${rp}::double precision AND ${np}::double precision+${rp}::double precision`,
      `POWER(easting-${ep}::double precision,2)+POWER(northing-${np}::double precision,2)<=POWER(${rp}::double precision,2)`)
    distance = `,SQRT(POWER(easting-${ep}::double precision,2)+POWER(northing-${np}::double precision,2)) AS distance_m`
    ordering = 'distance_m, id'
  }
  const owner = values.length + 1; values.push(ctx.userId)
  const limit = bind(query.limit)
  const result = await db.query<RegistryRow>(`SELECT ${columns(owner)}${distance} FROM beacon_registry WHERE ${clauses.join(' AND ')} ORDER BY ${ordering} LIMIT ${limit}`, values)
  return NextResponse.json({ data: { beacons: result.rows, searchType: near ? 'proximity' : 'text', total: result.rows.length,
    ...(near ? { center: { easting: query.easting, northing: query.northing }, radiusM: query.radius, crs, distanceMode: 'grid' } : {}) } }, { headers: privateHeaders })
})

const createSchema = beaconInputSchema.omit({ isAdopted: true }).extend({
  projectId: z.string().guid(), beaconNumber: z.string().trim().min(1).max(100),
  elevation: z.number().finite().min(-10000).max(100000).nullable().prefault(null),
  verticalDatum: z.string().trim().min(1).max(200).nullable().prefault(null),
  isAdopted: z.literal(false).optional(),
  establishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value).optional(),
}).strict()
export const POST = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (_req, ctx) => {
  const parsed = createSchema.safeParse(ctx.body)
  if (!parsed.success) return NextResponse.json({ error: 'A declared project and valid beacon observations are required', issues: parsed.error.issues }, { status: 400 })
  const body = parsed.data
  const beacon = await db.transaction(async client => {
    const project = (await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE', [body.projectId])).rows[0]
    if (project?.user_id !== ctx.userId) fail('An owned project is required to register this mark', 403)
    if ((await client.query<{ '?column?': number }>("SELECT 1 FROM beacon_registry WHERE project_id=$1 AND beacon_number=$2 AND status <> 'SUPERSEDED' AND superseded_by_id IS NULL LIMIT 1", [body.projectId, body.beaconNumber])).rowCount) fail('This project already has a current mark with that number', 409)
    const referenceRow = (await client.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE', [body.projectId])).rows[0]
    const reference = resolveStageReference(referenceRow, {})
    if (!reference.code || reference.source !== 'declared') fail('Declare the project coordinate reference before registering a mark', 400)
    if (body.elevation !== null && (!reference.verticalDatum || reference.verticalDatum !== body.verticalDatum)) fail('The observed height needs the project vertical datum', 409)
    const info = resolveEpsg(reference.code), range = validateCoordinateRange(body.easting, body.northing, reference.code)
    if (!range.valid) fail(range.errors.join('; '), 400)
    if (info.zone == null || body.easting < 100000 || body.easting > 1000000 || body.northing < 9000000 || body.northing > 11000000) fail('This grid or coordinate range is not yet supported by the beacon registry', 400)
    const [lon, lat] = transformPoint(body.easting, body.northing, reference.code, 'EPSG:4326')
    const row = (await client.query<RegistryRow>(`INSERT INTO beacon_registry(beacon_number,beacon_type,easting,northing,elevation,utm_zone,datum,projection,
      horizontal_crs,project_id,created_by,county,sub_county,locality,sheet_number,established_by,established_date,condition,description,
      sigma_e,sigma_n,sigma_rl,source_confidence,is_adopted,latitude,longitude,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,'UTM',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL,NULL,NULL,0,false,$19,$20,$21)
      RETURNING id,beacon_number,easting,northing,elevation,horizontal_crs,project_id`,
      [body.beaconNumber,body.beaconType ?? 'concrete',body.easting,body.northing,body.elevation,info.zone,info.datum,reference.code,
        body.projectId,ctx.userId,body.county ?? null,body.subCounty ?? null,body.locality ?? null,body.sheetNumber ?? null,
        body.establishedBy ?? null,body.establishedDate ?? null,body.condition ?? 'good',body.description ?? null,lat,lon,
        JSON.stringify({ reference, verified: false, registeredBy: ctx.userId })])).rows[0]
    if (!row) throw new Error('Beacon registration was not recorded')
    await logAuditEvent({ userId: ctx.userId, action: 'create', resourceType: 'beacon_registry', resourceId: row.id, timestamp: new Date(), details: { projectId: body.projectId, input: body, reference: referenceRow, registered: true, verified: false } }, client)
    return row
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') fail('This mark number is already registered on its sheet', 409)
    throw error
  })
  return NextResponse.json({ data: { beacon, message: 'Beacon registered; control verification remains required' } }, { status: 201, headers: privateHeaders })
})
