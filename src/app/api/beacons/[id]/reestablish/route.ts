/** Re-observe a mark without overwriting its published coordinate or provenance. */
import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { resolveEpsg, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'

export const dynamic = 'force-dynamic'
const bodySchema = z.object({
  requestId: z.string().uuid(), projectId: z.string().uuid(), easting: z.number().finite(), northing: z.number().finite(),
  elevation: z.number().finite().min(-10000).max(100000).nullable().default(null),
  horizontalCrs: z.string().trim().min(1).max(80), originalHorizontalCrs: z.string().trim().min(1).max(80),
  verticalDatum: z.string().trim().min(1).max(200).nullable().default(null),
  ties: z.string().trim().min(1).max(8000), instrument: z.string().trim().min(1).max(200),
  note: z.string().trim().min(1).max(8000),
  observationDate: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()),
}).strict()
interface BeaconRow {
  id: string; project_id: string | null; created_by: string | null;
  beacon_number: string; easting: number; northing: number; elevation: number | null;
  status: string; superseded_by_id: string | null; horizontal_crs: string | null;
  beacon_type: string; sheet_number: string | null; county: string | null;
  sub_county: string | null; locality: string | null;
}
interface CaptureRow {
  id: string; replacement_id: string; input_hash: string;
  predecessor_snapshot: BeaconRow; observation: Record<string, unknown>; reference_snapshot: Record<string, unknown>;
}
function fail(message: string, status: number): never { throw new AppError(message, status, 'BEACON_REESTABLISHMENT') }
const privateHeaders = { 'Cache-Control': 'private, no-store' }

export const POST = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (_req, ctx) => {
  const beaconId = z.string().uuid().safeParse((await ctx.params)?.id), parsed = bodySchema.safeParse(ctx.body)
  if (!beaconId.success || !parsed.success) return NextResponse.json({ error: 'A beacon ID and complete observed replacement evidence are required' }, { status: 400 })
  const body = parsed.data
  if (Date.parse(body.observationDate) > Date.now() + 300000) fail('Observation date cannot be in the future', 400)
  const inputHash = createHash('sha256').update(JSON.stringify({ beaconId: beaconId.data, ...body })).digest('hex')
  const result = await db.transaction(async client => {
    // Parent first, then the mark: recheck every decision under transaction locks.
    const discovery = (await client.query<Pick<BeaconRow, 'project_id' | 'created_by'>>('SELECT project_id, created_by FROM beacon_registry WHERE id=$1', [beaconId.data])).rows[0]
    if (!discovery || discovery.created_by !== ctx.userId) fail('Beacon not found', 404)
    if (discovery.project_id && discovery.project_id !== body.projectId) fail('The mark belongs to a different project', 409)
    const project = (await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id=$1 FOR SHARE', [body.projectId])).rows[0]
    if (project?.user_id !== ctx.userId) fail('Beacon project ownership is required', 403)
    const previous = (await client.query<BeaconRow>('SELECT * FROM beacon_registry WHERE id=$1 AND created_by=$2 FOR UPDATE', [beaconId.data, ctx.userId])).rows[0]
    if (!previous || previous.project_id !== discovery.project_id) fail('Beacon project changed; reload before recording', 409)
    const replay = (await client.query<CaptureRow>('SELECT * FROM beacon_reestablishment_captures WHERE project_id=$1 AND actor_id=$2 AND request_id=$3', [body.projectId, ctx.userId, body.requestId])).rows[0]
    if (replay) {
      if (replay.input_hash !== inputHash) fail('This request ID already records different observed evidence', 409)
      return { capture: replay, replayed: true }
    }
    if (previous.superseded_by_id || previous.status === 'SUPERSEDED' || (await client.query('SELECT 1 FROM beacon_registry WHERE re_established_from_id=$1 LIMIT 1', [previous.id])).rowCount) fail('This mark already has a replacement; re-observe its newest record instead', 409)
    const referenceRow = (await client.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE', [body.projectId])).rows[0]
    const reference = resolveStageReference(referenceRow, {})
    if (!reference.code || reference.source !== 'declared') fail('Declare a projected metre reference in project settings first', 400)
    let supplied: string, original: string
    try { supplied = resolveEpsg(body.horizontalCrs).code; original = resolveEpsg(body.originalHorizontalCrs).code }
    catch { return fail('The observed and original coordinate references must be registered survey grids', 400) }
    if (supplied !== reference.code || original !== reference.code || (previous.horizontal_crs && previous.horizontal_crs !== original)) fail('Original and observed coordinates must use the declared project grid; transform them in the reference workflow first', 409)
    if (body.elevation !== null && (!reference.verticalDatum || body.verticalDatum !== reference.verticalDatum)) fail('The observed height needs the declared project vertical datum', 409)
    const range = validateCoordinateRange(body.easting, body.northing, reference.code)
    if (!range.valid) fail(range.errors.join('; '), 400)
    // The existing registry's country/grid limits remain an explicit open gate.
    const info = resolveEpsg(reference.code)
    if (info.zone == null || body.easting < 100000 || body.easting > 1000000 || body.northing < 9000000 || body.northing > 11000000) fail('This grid or coordinate range is not yet supported by the beacon registry', 400)
    const replacementId = randomUUID(), number = `${previous.beacon_number.slice(0, 60)}-R-${replacementId}`
    const [longitude, latitude] = transformPoint(body.easting, body.northing, reference.code, 'EPSG:4326')
    const observation = { ...body, horizontalCrs: reference.code, originalHorizontalCrs: original, replacementId, beaconNumber: number, numberAssignment: 'local_reference', certified: false }
    await client.query(`INSERT INTO beacon_registry(id,beacon_number,beacon_type,easting,northing,elevation,utm_zone,datum,projection,
      horizontal_crs,project_id,created_by,re_established_at,re_established_by,re_established_from_id,status,
      reestablishment_note,established_by,established_date,source,condition,sheet_number,county,sub_county,locality,
      sigma_e,sigma_n,sigma_rl,source_confidence,is_adopted,latitude,longitude,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'UTM',$9,$10,$11,$12,$11,$13,'ESTABLISHED',$14,NULL,NULL,
      're-establishment','good',$15,$16,$17,$18,NULL,NULL,NULL,0,false,$19,$20,$21)`,
      [replacementId, number, previous.beacon_type, body.easting, body.northing, body.elevation, info.zone, info.datum, reference.code,
        body.projectId, ctx.userId, body.observationDate, previous.id, body.note, previous.sheet_number, previous.county, previous.sub_county,
        previous.locality, latitude, longitude, JSON.stringify({ reference, numberAssignment: 'local_reference', verified: false })])
    const capture = (await client.query<CaptureRow>(`INSERT INTO beacon_reestablishment_captures(project_id,predecessor_id,replacement_id,actor_id,request_id,input_hash,
      reference_snapshot,predecessor_snapshot,observation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [body.projectId, previous.id, replacementId, ctx.userId, body.requestId, inputHash,
        JSON.stringify({ declaredProjectReference: referenceRow, originalReferenceSource: previous.horizontal_crs ? 'registry_declaration' : 'surveyor_declaration', originalHorizontalCrs: original }), JSON.stringify(previous), JSON.stringify(observation)])).rows[0]
    if (!capture) throw new Error('Beacon observation was not recorded')
    const superseded = await client.query("UPDATE beacon_registry SET status='SUPERSEDED',superseded_by_id=$2 WHERE id=$1 AND superseded_by_id IS NULL", [previous.id, replacementId])
    if (superseded.rowCount !== 1) fail('Beacon replacement could not be committed; reload and retry', 409)
    return { capture, replayed: false }
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') fail('A replacement or request ID was recorded concurrently; reload before retrying', 409)
    throw error
  })
  return NextResponse.json({ data: { ...result, certified: false } }, { status: result.replayed ? 200 : 201, headers: privateHeaders })
})
export const GET = apiHandler({ auth: true }, async (_req, ctx) => {
  const id = z.string().uuid().safeParse((await ctx.params)?.id)
  if (!id.success) return NextResponse.json({ error: 'Beacon ID required' }, { status: 400 })
  const captures = await db.query<CaptureRow>('SELECT * FROM beacon_reestablishment_captures WHERE (predecessor_id=$1 OR replacement_id=$1) AND actor_id=$2 ORDER BY created_at', [id.data, ctx.userId])
  return NextResponse.json({ data: { captures: captures.rows } }, { headers: privateHeaders })
})
