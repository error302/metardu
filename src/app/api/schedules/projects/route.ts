import { z } from 'zod'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { privateApiSuccess as apiSuccess } from '@/lib/api/privateResponse'
import { listScheduleProjects } from '@/lib/schedule/server'
export const dynamic='force-dynamic'
export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60_000}},async(req)=>{
  const params=new URL(req.url).searchParams
  const parsed=z.object({q:z.string().max(100),id:z.string().uuid().nullable()}).safeParse({q:params.get('q')??'',id:params.get('projectId')})
  if(!parsed.success)return NextResponse.json({error:'Invalid project filters'},{status:400})
  return apiSuccess(await listScheduleProjects(parsed.data.q,parsed.data.id))
})
