import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import type { FieldControlInput } from '@/lib/engine/fieldControlCheck'
export type ControlSourceType = FieldControlInput['pointType']
export interface ControlSourceRow {
 id:string; name:string; easting:number; northing:number; elevation:number|null;
 horizontal_crs:string|null; vertical_datum:string|null; snapshot:Record<string,unknown>;
}
const sources = {
 survey_point:{table:'survey_points',name:'point_name',where:'s.project_id=$1 AND s.is_control AND s.deleted_at IS NULL',datum:'s.vertical_datum'},
 beacon:{table:'beacon_registry',name:'beacon_number',where:"s.project_id=$1 AND s.created_by=$2 AND s.status <> 'SUPERSEDED' AND s.superseded_by_id IS NULL",datum:"s.metadata#>>'{reference,verticalDatum}'"},
 boundary_monument:{table:'boundary_monuments',name:'monument_number',where:'(s.project_id IS NULL OR s.project_id=$1) AND s.created_by=$2',datum:'s.vertical_datum'},
} as const
export const evidenceHash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function controlSources(client:PoolClient,type:ControlSourceType,projectId:string,actorId:string,id?:string) {
 const descriptor=sources[type]
 // Table/column expressions come exclusively from this fixed descriptor map.
 const values=[projectId,...(type!=='survey_point'?[actorId]:[])]
 const where=descriptor.where+(id?` AND s.id=$${values.length+1}`:'')
 if(id)values.push(id)
 const sql=`SELECT s.id,s.${descriptor.name} AS name,s.easting::double precision AS easting,s.northing::double precision AS northing,s.elevation::double precision AS elevation,s.horizontal_crs,${descriptor.datum} AS vertical_datum,to_jsonb(s) AS snapshot FROM public.${descriptor.table} s WHERE ${where} ORDER BY s.${descriptor.name},s.id LIMIT 200 ${id?'FOR SHARE':''}`
 return (await client.query<ControlSourceRow>(sql,values)).rows
}
export function controlBasisIssue(source:ControlSourceRow,referenceRow:Record<string,unknown>|undefined,withHeight=false):string|null {
 try {
  const reference=resolveStageReference(referenceRow,{})
  if(reference.source!=='declared'||!reference.code)return 'Declare the project reference first'
  if(!source.horizontal_crs||source.horizontal_crs!==reference.code)return 'The saved mark must have the same explicit horizontal grid as the project'
  if(assertProjectedCrs(reference.code).units!=='metres')return 'Use a projected metre grid'
  const range=validateCoordinateRange(source.easting,source.northing,reference.code)
  if(!range.valid)return range.errors.join('; ')
  if(withHeight&&(source.elevation===null||!Number.isFinite(source.elevation)||!source.vertical_datum||source.vertical_datum!==reference.verticalDatum))return 'The saved height and project must have the same explicit vertical datum'
  return null
 } catch(error){return error instanceof Error?error.message:'Invalid reference basis'}
}
