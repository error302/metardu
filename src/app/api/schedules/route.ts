import { z } from 'zod'
import { NextResponse } from 'next/server'
import { apiHandler,apiSuccess } from '@/lib/apiHandler'
import { scheduleCreateSchema } from '@/lib/schedule/contracts'
import { createScheduledJob,listSchedules } from '@/lib/schedule/server'
export const dynamic='force-dynamic'

export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60_000}},async(req,ctx)=>{
  const params=new URL(req.url).searchParams
  const parsed=z.object({
    status:z.enum(['upcoming','in_progress','completed','cancelled']).nullable(),
    offset:z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(100000)),
  }).safeParse({status:params.get('status'),offset:params.get('offset')??'0'})
  if(!parsed.success)return NextResponse.json({error:'Invalid schedule filters'},{status:400})
  return apiSuccess(await listSchedules(ctx.userId,parsed.data.status,parsed.data.offset,50))
})
export const POST=apiHandler({auth:true,schema:scheduleCreateSchema,rateLimit:{max:30,windowMs:60_000}},async(_req,ctx)=>{
  const input=scheduleCreateSchema.parse(ctx.body)
  return apiSuccess({schedule:await createScheduledJob(ctx.userId,input)},201)
})
