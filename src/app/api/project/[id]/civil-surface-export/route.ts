import {NextResponse} from 'next/server'
import {z} from 'zod'
import {apiHandler} from '@/lib/apiHandler'
import {db} from '@/lib/db'
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {checkFeatureAccess} from '@/lib/subscription/subscriptionEngine'
import {generateRetainedCivilSurface} from '@/lib/export/retainedCivilSurface'

export const dynamic='force-dynamic'
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}})
/** Read-only exact-revision download. No triangulation, current-point fallback or database mutation. */
export const GET=apiHandler({auth:true},async(req,ctx)=>{
  const projectId=ctx.params.id,revisionId=req.nextUrl.searchParams.get('revisionId')
  if(!z.string().guid().safeParse(projectId).success||revisionId&&!z.string().guid().safeParse(revisionId).success)return reply({error:'Valid project and saved surface revision IDs are required.'},400)
  const access=await requireProjectReadAccess(projectId,ctx.userId)
  if(!access.ok)return access.error??reply({error:'Project access was not confirmed.'},403)
  if(!access.projectUserId)return reply({error:'Project ownership is not established.'},403)
  if(!revisionId){
    const {rows}=await db.query<Record<string, unknown>>(`SELECT r.id AS revision_id,s.id AS surface_id,s.name,r.revision,r.crs,r.point_count,r.triangle_count,r.input_hash,r.computed_at
      FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id JOIN projects p ON p.id=s.project_id
      WHERE s.project_id=$1 AND p.user_id=$2 ORDER BY r.computed_at DESC,r.id LIMIT 201`,[projectId,access.projectUserId])
    return reply({data:{projectId,viewerId:ctx.userId,revisions:rows.slice(0,200),limited:rows.length>200}})
  }
  const feature=await checkFeatureAccess(ctx.userId,'landxml',ctx.session?.user?.email??undefined)
  if(!feature.allowed)return reply({error:'LandXML export requires an active eligible plan.'},403)
  const {rows}=await db.query<Record<string, unknown>>(`SELECT r.id AS revision_id,s.id AS surface_id,s.project_id,p.user_id,p.name AS project_name,s.name,r.revision,r.crs,
      r.point_count,r.triangle_count,r.input_hash,r.parameters,r.result
    FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id JOIN projects p ON p.id=s.project_id
    WHERE s.project_id=$1 AND r.id=$2 AND p.user_id=$3`,[projectId,revisionId,access.projectUserId])
  if(rows.length!==1)return reply({error:'Saved surface revision not found in this project.'},404)
  try{
    const xml=generateRetainedCivilSurface(rows[0],projectId,revisionId)
    return new NextResponse(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="surface-${revisionId}.xml"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
  }catch{return reply({error:'This saved surface does not have consistent retained mesh and reference evidence. Review or compute a new revision; the original records remain intact.',code:'SURFACE_HANDOFF_UNVERIFIED'},409)}
})
