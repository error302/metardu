import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { publicControlSchema, type PublicControlRow } from '@/lib/survey/publicControl'
export const dynamic='force-dynamic'
const schema=z.object({decision:z.enum(['verified','rejected']),reason:z.string().trim().min(5).max(4000)}).strict()
export const POST=apiHandler({auth:true,roles:['admin','super_admin'],schema,rateLimit:{max:30,windowMs:60000}},async(_req,ctx)=>{
 if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid catalogue record'},{status:400})
 const body=ctx.body as z.infer<typeof schema>
 const result=await db.transaction(async client=>{
  if(!(await client.query<{allowed:boolean}>('SELECT is_admin() AS allowed')).rows[0].allowed)throw new AppError('Catalogue review requires an active database reviewer role',403,'CONTROL_REVIEW')
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('public_control:' || $1,0))",[ctx.params.id])
  const source=(await client.query<PublicControlRow>('SELECT b.*,to_jsonb(b) AS snapshot FROM public_beacons b WHERE id=$1 FOR UPDATE',[ctx.params.id])).rows[0]
  if(!source)throw new AppError('Reference record not found',404,'CONTROL_REVIEW')
  if(source.submitted_by===ctx.userId)throw new AppError('A second reviewer must review this submission',403,'CONTROL_REVIEW')
  if(body.decision==='verified'&&!publicControlSchema.safeParse({name:source.name,beaconType:source.beacon_type,easting:source.easting,northing:source.northing,elevation:source.elevation,horizontalCrs:source.horizontal_crs,verticalDatum:source.vertical_datum,sourceReference:source.source_reference,authority:source.authority,country:source.country,description:source.description??''}).success)throw new AppError('The source record needs valid coordinates and explicit reference evidence before review',409,'CONTROL_REVIEW')
  const review=(await client.query<{id:string;created_at:Date}>('INSERT INTO public_beacon_reviews(beacon_id,reviewer_id,decision,reason,source_snapshot) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at',[source.id,ctx.userId,body.decision,body.reason,source.snapshot])).rows[0]
  await client.query('UPDATE public_beacons b SET status=r.decision,verified_by=r.reviewer_id,verified_at=r.created_at FROM public_beacon_reviews r WHERE b.id=$1 AND r.id=$2',[source.id,review.id])
  await logAuditEvent({userId:ctx.userId,action:'review',resourceType:'public_beacons',resourceId:source.id,timestamp:new Date(),details:{reviewId:review.id,...body,fieldVerified:false}},client)
  return {reviewId:review.id,status:body.decision,fieldVerified:false}
 })
 return NextResponse.json({data:result},{status:201,headers:{'Cache-Control':'private, no-store'}})
})
