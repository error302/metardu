export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { fieldControlSchema, assessFieldControl, type FieldControlInput } from '@/lib/engine/fieldControlCheck'
import { controlSources, controlBasisIssue, evidenceHash } from '@/lib/survey/fieldControlSources'
import { validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
const headers={'Cache-Control':'private, no-store'}
const fail=(message:string,status=400):never=>{throw new AppError(message,status,'FIELD_CONTROL_CHECK')}
const querySchema=z.object({projectId:z.string().uuid().optional(),pointType:z.enum(['survey_point','beacon','boundary_monument']).default('survey_point'),options:z.enum(['true','false']).default('false'),legacy:z.enum(['true','false']).default('false'),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict()
export const GET=apiHandler({auth:true,rateLimit:{max:60,windowMs:60000}},async(req,ctx)=>{
 const parsed=querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
 if(!parsed.success)return fail('Valid project and filter values are required')
 const query=parsed.data
 if(query.legacy==='true'){
  const rows=(await db.query('SELECT * FROM control_point_verifications WHERE verified_by=$1 ORDER BY verification_date DESC,id LIMIT $2',[ctx.userId,query.limit])).rows
  return NextResponse.json({data:rows,legacy:true,certified:false,message:'Historical records lack retained basis and criterion evidence; their prior status is not an evidenced project verification.'},{headers})
 }
 if(!query.projectId)return fail('Select an owned project')
 const projectId=query.projectId
 const data=await db.transaction(async client=>{
  const project=(await client.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1 FOR SHARE',[query.projectId])).rows[0]
  if(project?.user_id!==ctx.userId)fail('An owned project is required',403)
  if(query.options==='true'){
   const reference=(await client.query<{snapshot:Record<string,unknown>}>('SELECT to_jsonb(r) AS snapshot FROM project_reference_systems r WHERE project_id=$1',[query.projectId])).rows[0]?.snapshot
   const sources=await controlSources(client,query.pointType,projectId,ctx.userId)
   return {marks:sources.map(source=>({...source,snapshot:undefined,basisHash:evidenceHash({source:source.snapshot,reference}),issue:controlBasisIssue(source,reference)})),reference}
  }
  const rows=(await client.query('SELECT * FROM control_field_checks WHERE project_id=$1 ORDER BY observed_at DESC,id LIMIT $2',[query.projectId,query.limit])).rows
  return {checks:rows}
 })
 return NextResponse.json({data,certified:false},{headers})
})
export const POST=apiHandler({auth:true,schema:fieldControlSchema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
 const input=ctx.body as FieldControlInput,inputHash=evidenceHash(input)
 const saved=await db.transaction(async client=>{
  const project=(await client.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE',[input.projectId])).rows[0]
  if(project?.user_id!==ctx.userId)fail('An owned project is required',403)
  const replay=(await client.query<{id:string;input_hash:string;result:unknown}>('SELECT id,input_hash,result FROM control_field_checks WHERE project_id=$1 AND actor_id=$2 AND request_id=$3',[input.projectId,ctx.userId,input.requestId])).rows[0]
  if(replay){if(replay.input_hash!==inputHash)fail('The retry request has different observation evidence',409);return {id:replay.id,result:replay.result,replayed:true}}
  if(Date.parse(input.observedAt)>Date.now())fail('Observation time cannot be in the future')
  // Keep PostgreSQL JSON timestamps intact; JS Date truncates microseconds.
  const reference=(await client.query<{snapshot:Record<string,unknown>}>('SELECT to_jsonb(r) AS snapshot FROM project_reference_systems r WHERE project_id=$1 FOR SHARE',[input.projectId])).rows[0]?.snapshot
  const source=(await controlSources(client,input.pointType,input.projectId,ctx.userId,input.pointId))[0]
  if(!source)fail('A current owned control record is required',404)
  if(evidenceHash({source:source.snapshot,reference})!==input.basisHash)fail('The saved control basis or project reference changed; reload it before comparing observations',409)
  const issue=controlBasisIssue(source,reference,input.measuredElevation!==null)
  if(issue)fail(issue,409)
  if(input.measuredEasting!==null&&input.measuredNorthing!==null){
   if(!source.horizontal_crs)return fail('The saved mark has no declared grid',409)
   const range=validateCoordinateRange(input.measuredEasting,input.measuredNorthing,source.horizontal_crs)
   if(!range.valid)fail(range.errors.join('; '))
  }
  const result=assessFieldControl(source,input)
  const record=(await client.query<{id:string;result:unknown}>(`INSERT INTO control_field_checks(project_id,actor_id,point_type,point_id,request_id,input_hash,source_snapshot,reference_snapshot,observation,result,observed_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,result`,[input.projectId,ctx.userId,input.pointType,input.pointId,input.requestId,inputHash,JSON.stringify(source.snapshot),JSON.stringify(reference),JSON.stringify(input),JSON.stringify(result),input.observedAt])).rows[0]
  await logAuditEvent({userId:ctx.userId,action:'create',resourceType:'control_field_checks',resourceId:record.id,timestamp:new Date(),details:{projectId:input.projectId,input,result,certified:false}},client)
  return {...record,replayed:false}
 })
 return NextResponse.json({data:saved,certified:false},{status:saved.replayed?200:201,headers})
})
