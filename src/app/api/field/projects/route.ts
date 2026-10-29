import { z } from 'zod'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { privateApiSuccess as apiSuccess } from '@/lib/api/privateResponse'
import { db } from '@/lib/db'
export const dynamic='force-dynamic'
interface FieldProjectRow {
  id:string;name:string;survey_type:string|null;location:string|null;created_at:Date;datum:string|null;
  utm_zone:number|null;hemisphere:string|null;engineering_data:unknown|null;reference_system:unknown|null
}
export const GET=apiHandler({auth:true,rateLimit:{max:120,windowMs:60000}},async(req)=>{
  const params=new URL(req.url).searchParams
  const parsed=z.object({id:z.string().uuid().nullable(),plan:z.enum(['0','1']),q:z.string().max(100)})
    .safeParse({id:params.get('projectId'),plan:params.get('includePlan')??'0',q:params.get('q')??''})
  if(!parsed.success)return NextResponse.json({error:'Invalid field project filters'},{status:400})
  const result=await db.query<FieldProjectRow>(
    `SELECT p.id,p.name,p.survey_type,p.location,p.created_at,p.datum,p.utm_zone,p.hemisphere,
      CASE WHEN $2 THEN p.engineering_data ELSE NULL END AS engineering_data,
      CASE WHEN $2 THEN to_jsonb(r) ELSE NULL END AS reference_system
     FROM public.projects p LEFT JOIN public.project_reference_systems r ON r.project_id=p.id AND $2
     WHERE p.user_id IS NOT NULL AND public.survey_schedule_project_access(p.id,TRUE)
       AND ($1::uuid IS NULL OR p.id=$1) AND ($3='' OR p.name ILIKE '%'||$3||'%')
     ORDER BY p.created_at DESC,p.id LIMIT 51`,[parsed.data.id,parsed.data.plan==='1'&&Boolean(parsed.data.id),parsed.data.q],
  )
  if(parsed.data.id&&!result.rows.length)return NextResponse.json({error:'This project is unavailable for field collection.'},{status:403})
  return apiSuccess({projects:result.rows.slice(0,50).map(row=>({...row,created_at:row.created_at.toISOString()})),hasMore:result.rows.length>50})
})
