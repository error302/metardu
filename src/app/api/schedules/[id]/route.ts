import { z } from 'zod'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { privateApiSuccess as apiSuccess } from '@/lib/api/privateResponse'
import { scheduleUpdateSchema } from '@/lib/schedule/contracts'
import { updateScheduledJob,getScheduledJob } from '@/lib/schedule/server'
export const dynamic='force-dynamic'
export const PATCH=apiHandler({auth:true,schema:scheduleUpdateSchema,rateLimit:{max:60,windowMs:60_000}},async(_req,ctx)=>{
  if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid schedule identifier'},{status:400})
  return apiSuccess({schedule:await updateScheduledJob(ctx.userId,ctx.params.id,scheduleUpdateSchema.parse(ctx.body))})
})
export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60_000}},async(_req,ctx)=>{
  if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Invalid schedule identifier'},{status:400})
  return apiSuccess({schedule:await getScheduledJob(ctx.userId,ctx.params.id)})
})
