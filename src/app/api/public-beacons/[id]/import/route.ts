import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { assertControlImportReference, type PublicControlRow } from '@/lib/survey/publicControl'
import { resolveEpsg, transformPoint } from '@/lib/spatial/projectCrs'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
export const dynamic='force-dynamic'
const schema=z.object({projectId:z.string().uuid(),requestId:z.string().uuid(),pointName:z.string().trim().min(1).max(100)}).strict()
export const POST=apiHandler({auth:true,schema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
 if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid reference record'},{status:400})
 const body=ctx.body as z.infer<typeof schema>,hash=createHash('sha256').update(JSON.stringify({beaconId:ctx.params.id,...body})).digest('hex')
 const result=await db.transaction(async client=>{
  const project=(await client.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE',[body.projectId])).rows[0]
  if(project?.user_id!==ctx.userId)throw new AppError('An owned project is required',403,'CONTROL_IMPORT')
  const existing=(await client.query<{id:string;point_id:string;input_hash:string}>('SELECT id,point_id,input_hash FROM control_import_captures WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[body.projectId,ctx.userId,body.requestId])).rows[0]
  if(existing){if(existing.input_hash!==hash)throw new AppError('This request ID records a different import',409,'CONTROL_IMPORT');return {captureId:existing.id,pointId:existing.point_id,replayed:true}}
  // Catalogue readers cannot take an UPDATE-policy row lock. Coordinate rows
  // are immutable after review; share the review route's transaction lock and
  // recheck the exact current snapshot in the capture's database insert policy.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('public_control:' || $1,0))",[ctx.params.id])
  const source=(await client.query<PublicControlRow>('SELECT b.*,to_jsonb(b) AS snapshot FROM public_beacons b WHERE id=$1',[ctx.params.id])).rows[0]
  if(!source||source.status!=='verified')throw new AppError('A reviewed catalogue reference is required',409,'CONTROL_IMPORT')
  if(!(await client.query("SELECT 1 FROM public_beacon_reviews r JOIN public_beacons b ON b.id=r.beacon_id WHERE b.id=$1 AND r.decision='verified' AND r.reviewer_id=b.verified_by AND r.created_at=b.verified_at",[source.id])).rowCount)throw new AppError('The catalogue review evidence is missing',409,'CONTROL_IMPORT')
  const referenceRow=(await client.query<Record<string,unknown>&{snapshot:Record<string,unknown>}>('SELECT r.*,to_jsonb(r) AS snapshot FROM project_reference_systems r WHERE project_id=$1 FOR SHARE',[body.projectId])).rows[0]
  const reference=resolveStageReference(referenceRow,{})
  try{assertControlImportReference(source,reference)}catch(error){throw new AppError(error instanceof Error?error.message:'References do not match',409,'CONTROL_IMPORT')}
  if((await client.query('SELECT 1 FROM control_import_captures WHERE project_id=$1 AND beacon_id=$2',[body.projectId,source.id])).rowCount)throw new AppError('This source mark already has an import capture in the project',409,'CONTROL_IMPORT')
  if((await client.query('SELECT 1 FROM survey_points WHERE project_id=$1 AND point_name=$2 AND deleted_at IS NULL',[body.projectId,body.pointName])).rowCount)throw new AppError('A point with this name already exists',409,'CONTROL_IMPORT')
  const info=resolveEpsg(reference.code as string),[lon,lat]=transformPoint(source.easting,source.northing,info.code,'EPSG:4326')
  const point=(await client.query<{id:string}>(`INSERT INTO survey_points(project_id,point_name,easting,northing,elevation,is_control,datum,projection,utm_zone,hemisphere,horizontal_crs,vertical_datum,source,description,geom)
   VALUES($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,'imported',$12,ST_SetSRID(ST_MakePoint($13,$14),4326)) RETURNING id`,
   [body.projectId,body.pointName,source.easting,source.northing,source.elevation,info.datum,info.zone?'UTM':info.name.slice(0,20),info.zone??null,info.hemisphere??null,info.code,source.vertical_datum,
    `Imported catalogue reference; field verification required. Source: ${source.name}`,lon,lat])).rows[0]
  const capture=(await client.query<{id:string}>('INSERT INTO control_import_captures(project_id,beacon_id,point_id,actor_id,request_id,input_hash,source_snapshot,project_reference_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[body.projectId,source.id,point.id,ctx.userId,body.requestId,hash,source.snapshot,referenceRow.snapshot])).rows[0]
  await logAuditEvent({userId:ctx.userId,action:'import',resourceType:'survey_points',resourceId:point.id,timestamp:new Date(),details:{captureId:capture.id,beaconId:source.id,projectId:body.projectId,fieldVerified:false}},client)
  return {captureId:capture.id,pointId:point.id,replayed:false}
 })
 return NextResponse.json({data:{...result,fieldVerified:false,lockedSourceCoordinates:true}},{status:result.replayed?200:201,headers:{'Cache-Control':'private, no-store'}})
})
