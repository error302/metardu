import { z } from 'zod'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { formatScheduleTime } from '@/lib/schedule/contracts'
export const dynamic='force-dynamic'
interface MessageRow {id:string;project_name:string;title:string;starts_at:Date;time_zone:string;kind:string;version:number}
export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60000}},async(_req,ctx)=>{
  if(!z.string().uuid().safeParse(ctx.params.id).success)return NextResponse.json({error:'Not found'},{status:404})
  const result=await db.query<MessageRow>(
    `SELECT j.id,p.name AS project_name,j.title,j.starts_at,j.time_zone,o.kind,j.version
     FROM public.survey_reminder_outbox o JOIN public.job_schedule j ON j.id=o.schedule_id AND j.user_id=o.user_id
     JOIN public.projects p ON p.id=j.project_id
     WHERE o.id=$1 AND o.user_id=$2 AND o.expires_at>NOW() AND o.schedule_version=j.version
       AND j.status='upcoming' AND public.survey_schedule_project_access(p.id,FALSE)`,[ctx.params.id,ctx.userId],
  )
  const row=result.rows[0]
  if(!row)return NextResponse.json({error:'This reminder is no longer available'},{status:404,headers:{'Cache-Control':'private, no-store'}})
  return NextResponse.json({
    title:(row.kind==='confirmation'?(row.version===1?'Survey scheduled: ':'Survey updated: '):'Survey reminder: ')+row.project_name,
    body:row.title+' · '+formatScheduleTime(row.starts_at.toISOString(),row.time_zone)+' ('+row.time_zone+')',
    url:'/schedule?job='+row.id,
  },{headers:{'Cache-Control':'private, no-store'}})
})
