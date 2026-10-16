import type {PoolClient} from 'pg'
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {AuthorizationError,NotFoundError,ValidationError,ConflictError} from '@/lib/api/errors'
import {resolveStageReference} from '@/lib/workspaces/stageReference'
import {roadFromAlignmentMirror} from './roadAlignmentMirror'
import {lockOwnedAlignment,type OwnedAlignment} from './alignmentAccess'
import {hashDesignPayload,type DesignRevisionRecord} from './designRevisions'
import {ROAD_QUANTITY_ALGORITHM,ROAD_QUANTITY_VERSION,type RoadQuantityRecord} from './roadQuantity'

export const QUANTITY_ENTITY='alignment-earthworks'
export interface QuantityRevision extends DesignRevisionRecord {
  created_by:string|null;payload:{quantityRun:RoadQuantityRecord['quantity']}
}
export async function lockQuantityAlignment(client:PoolClient,id:string,userId:string,write:boolean) {
  if(write)return lockOwnedAlignment(client,id,userId)
  const {rows:links}=await client.query<{project_id:string}>('SELECT project_id FROM road_alignments WHERE id = $1',[id])
  if(!links[0])throw new NotFoundError('Alignment not found')
  // Direct row locking also invokes UPDATE RLS, hiding read-only viewer rows.
  // This helper checks read scope and retains the project snapshot lock;
  // application RBAC is checked again below. It grants no project writes.
  const {rows:project}=await client.query<{user_id:string|null}>('SELECT user_id FROM public.lock_project_for_read($1)',[links[0].project_id])
  if(!project[0])throw new NotFoundError('Project not found')
  const access=await requireProjectReadAccess(links[0].project_id,userId)
  if(!access.ok)throw new AuthorizationError('This quantity register requires project read access.')
  const {rows}=await client.query<OwnedAlignment>('SELECT * FROM road_alignments WHERE id = $1 AND project_id = $2 FOR SHARE',[id,links[0].project_id])
  if(!rows[0])throw new NotFoundError('Alignment not found')
  return {...rows[0],project_owner:project[0].user_id}
}
export async function loadRoadQuantitySource(client:PoolClient,alignment:OwnedAlignment) {
  const {rows:refs}=await client.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id = $1 FOR SHARE',[alignment.project_id])
  const reference=resolveStageReference(refs[0],{})
  if(reference.source!=='declared')throw new ValidationError('Declare a valid projected-metre project reference before recording quantities.')
  const {rows:ips}=await client.query('SELECT * FROM alignment_ips WHERE alignment_id = $1 ORDER BY sort_order,created_at,id LIMIT 201',[alignment.id])
  const {rows:vips}=await client.query('SELECT * FROM alignment_vertical_ips WHERE alignment_id = $1 ORDER BY chainage,id LIMIT 201',[alignment.id])
  const {rows:stations}=await client.query('SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage,id LIMIT 5001',[alignment.id])
  if(ips.length>200||vips.length>200||stations.length>5000)throw new ValidationError('Split source inputs into supported road alignments before recording this quantity run.')
  try{return{road:roadFromAlignmentMirror({...alignment,ips,vips,stations}),reference}}
  catch(error){throw new ValidationError(error instanceof Error?error.message:'Review the saved road inputs.')}
}
export function quantityRecord(row:QuantityRevision):RoadQuantityRecord {
  const run=row.payload?.quantityRun
  if(!run||run.schemaVersion!==1||run.algorithmId!==ROAD_QUANTITY_ALGORITHM||run.algorithmVersion!==ROAD_QUANTITY_VERSION||
    hashDesignPayload(row.payload)!==row.content_hash||hashDesignPayload(run.inputs)!==run.inputHash||hashDesignPayload(run.result)!==run.outputHash)throw new ConflictError('The archived quantity run failed its identity check; retain it for review.')
  return{id:row.id,revision:row.revision,status:row.status,created_at:new Date(row.created_at).toISOString(),created_by:row.created_by,quantity:run}
}
