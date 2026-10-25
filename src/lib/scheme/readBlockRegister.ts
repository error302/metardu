import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { blockRegisterQuerySchema,blockRegisterSchema,BLOCK_REGISTER_PAGE_SIZE } from './blockRegister'

export async function readBlockRegister(actorId:string,projectId:string,blockId:string,input:unknown){
  const identity=z.object({actorId:z.string().uuid(),projectId:z.string().uuid(),blockId:z.string().uuid()}).safeParse({actorId,projectId,blockId})
  const query=blockRegisterQuerySchema.safeParse(input)
  if(!identity.success||!query.success)throw new AppError('Valid project/block UUIDs and register filters are required.',400,'BLOCK_REGISTER_INPUT')
  const {page,status,q}=query.data,size=BLOCK_REGISTER_PAGE_SIZE
  const pattern=`%${q.replace(/[\\%_]/g,'\\$&')}%`
  const result=await db.query<{data:unknown}>(`WITH owned_block AS (
    SELECT b.id,b.project_id,b.block_number,b.block_name,b.description,p.name project_name
    FROM blocks b JOIN projects p ON p.id=b.project_id WHERE b.id=$1 AND b.project_id=$2 AND p.user_id=$3
  ), records AS (
    SELECT p.id,p.parcel_number,p.lr_number_proposed,p.lr_number_confirmed,p.area_ha,p.status
    FROM parcels p JOIN owned_block b ON b.id=p.block_id AND b.project_id=p.project_id
  ), totals AS (
    SELECT COUNT(*) total,COUNT(*) FILTER(WHERE area_ha>0 AND area_ha::text NOT IN('NaN','Infinity','-Infinity')) known_area,
      COUNT(*) FILTER(WHERE area_ha IS NULL) unknown_area,
      COUNT(*) FILTER(WHERE area_ha IS NOT NULL AND NOT(area_ha>0 AND area_ha::text NOT IN('NaN','Infinity','-Infinity'))) invalid_area,
      COALESCE(SUM(CASE WHEN area_ha>0 AND area_ha::text NOT IN('NaN','Infinity','-Infinity') THEN area_ha ELSE 0 END),0)::text known_area_ha,
      COUNT(*) FILTER(WHERE status='pending') pending,COUNT(*) FILTER(WHERE status='field_complete') field_complete,
      COUNT(*) FILTER(WHERE status='computed') computed,COUNT(*) FILTER(WHERE status='plan_generated') plan_generated,
      COUNT(*) FILTER(WHERE status='submitted') submitted,COUNT(*) FILTER(WHERE status='approved') approved,
      COUNT(*) FILTER(WHERE status IS NULL OR status NOT IN('pending','field_complete','computed','plan_generated','submitted','approved')) unrecognized
    FROM records
  ), filtered AS (
    SELECT * FROM records WHERE ($4='all' OR status=$4 OR ($4='unrecognized' AND (status IS NULL OR status NOT IN('pending','field_complete','computed','plan_generated','submitted','approved'))))
    AND ($5='' OR parcel_number ILIKE $6 ESCAPE E'\\\\' OR COALESCE(lr_number_proposed,'') ILIKE $6 ESCAPE E'\\\\' OR COALESCE(lr_number_confirmed,'') ILIKE $6 ESCAPE E'\\\\')
  ), page_window AS (
    SELECT COUNT(*) total,LEAST($7::integer,GREATEST(1,CEIL(COUNT(*)::numeric/${size})::integer)) page FROM filtered
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY parcel_number COLLATE "C",id LIMIT ${size} OFFSET(SELECT (page-1)*${size} FROM page_window)
  ), projected_rows AS (
    SELECT jsonb_build_object('id',p.id,'project_id',p.project_id,'block_id',p.block_id,'parcel_number',p.parcel_number,
      'lr_number_proposed',p.lr_number_proposed,'lr_number_confirmed',p.lr_number_confirmed,'area_text',p.area_ha::text,
      'area_ha',CASE WHEN p.area_ha>0 AND p.area_ha::text NOT IN('NaN','Infinity','-Infinity') THEN p.area_ha ELSE NULL END,
      'area_state',CASE WHEN p.area_ha IS NULL THEN 'unknown' WHEN p.area_ha>0 AND p.area_ha::text NOT IN('NaN','Infinity','-Infinity') THEN 'known' ELSE 'invalid' END,
      'status',p.status,'assigned_surveyor',p.assigned_surveyor,'notes',p.notes,
      'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'revision_number',COALESCE(p.revision_number,0),
      'can_delete',COALESCE(p.status='pending',FALSE) AND NULLIF(p.lr_number_confirmed,'') IS NULL AND p.geom IS NULL
        AND NOT EXISTS(SELECT 1 FROM parcel_traverses t WHERE t.parcel_id=p.id) AND NOT EXISTS(SELECT 1 FROM parcel_import_sources s WHERE s.parcel_id=p.id)) value,
      p.parcel_number,p.id FROM page_rows page JOIN parcels p ON p.id=page.id AND p.project_id=$2 AND p.block_id=$1
  ) SELECT jsonb_build_object(
    'project',jsonb_build_object('id',b.project_id,'name',b.project_name),
    'block',jsonb_build_object('id',b.id,'projectId',b.project_id,'number',b.block_number,'name',b.block_name,'description',b.description),
    'summary',jsonb_build_object('total',t.total,'knownAreaCount',t.known_area,'unknownAreaCount',t.unknown_area,'invalidAreaCount',t.invalid_area,'knownAreaHa',t.known_area_ha,'submittedOrApproved',t.submitted+t.approved,
      'statusCounts',jsonb_build_object('pending',t.pending,'field_complete',t.field_complete,'computed',t.computed,'plan_generated',t.plan_generated,'submitted',t.submitted,'approved',t.approved),'unrecognizedStatusCount',t.unrecognized),
    'register',jsonb_build_object('total',w.total,'page',w.page,'pageSize',${size},'search',$5::text,'status',$4::text,'rows',COALESCE((SELECT jsonb_agg(value ORDER BY parcel_number COLLATE "C",id) FROM projected_rows),'[]'::jsonb))
  ) data FROM owned_block b CROSS JOIN totals t CROSS JOIN page_window w`,[blockId,projectId,actorId,status,q,pattern,page])
  if(result.rows.length!==1)throw new AppError('Block not found for this project and account.',404,'BLOCK_REGISTER_SCOPE')
  const parsed=blockRegisterSchema.safeParse(result.rows[0].data)
  if(!parsed.success)throw new AppError('The block register counts or rows are inconsistent. Retry the read.',500,'BLOCK_REGISTER_RESPONSE')
  return parsed.data
}
