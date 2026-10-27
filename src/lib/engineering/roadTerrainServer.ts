import type {PoolClient} from 'pg'
import {AppError} from '@/lib/api/errors'
import {fromReferenceSystemRow} from '@/lib/spatial/projectReferenceSystem'
import {inspectRetainedCivilSurface} from '@/lib/export/retainedCivilSurface'
import {hashDesignPayload} from './designRevisions'
import {roadTerrainDataSchema,type RoadTerrainData} from './roadTerrain'

/** Caller owns the transaction. Read only an exact owner-bound retained revision. */
export async function loadRoadRetainedTerrain(client:PoolClient,actor:string,project:string,revision:string):Promise<RoadTerrainData>{
  const {rows:owners}=await client.query<{user_id:string|null}>('SELECT user_id FROM projects WHERE id=$1 FOR SHARE',[project])
  if(owners.length!==1||owners[0].user_id!==actor)throw new AppError('The retained road terrain requires its recorded project owner.',403,'ROAD_TERRAIN_OWNER')
  const {rows:references}=await client.query<Record<string,unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE',[project])
  const current=fromReferenceSystemRow(references[0])
  if(!current)throw new AppError('Declare the complete project reference before reviewing retained terrain.',409,'ROAD_TERRAIN_REFERENCE')
  const {rows}=await client.query(`SELECT r.id AS revision_id,s.id AS surface_id,s.project_id,p.user_id,p.name AS project_name,s.name,r.revision,r.crs,
    r.point_count,r.triangle_count,r.input_hash,r.parameters,r.result FROM surface_revisions r
    JOIN surfaces s ON s.id=r.surface_id JOIN projects p ON p.id=s.project_id
    WHERE s.project_id=$1 AND r.id=$2 AND p.user_id=$3 FOR SHARE OF r,s`,[project,revision,actor])
  if(rows.length!==1)throw new AppError('The selected retained terrain revision is unavailable in this project.',404,'ROAD_TERRAIN_NOT_FOUND')
  try{
    const {row,reference}=inspectRetainedCivilSurface(rows[0],project,revision)
    if(hashDesignPayload({...current})!==hashDesignPayload({...reference}))throw Error('reference')
    return roadTerrainDataSchema.parse({identity:{projectId:project,surfaceId:row.surface_id,revisionId:revision,revision:row.revision,name:row.name,inputHash:row.input_hash,meshHash:row.result.outputIntegrity.meshHash,referenceHash:row.result.snapshot.referenceHash,crs:row.crs,verticalDatum:reference.prs.verticalDatum,fieldVerified:false},mesh:{points:row.result.mesh.points,triangles:row.result.mesh.triangles}})
  }catch{
    throw new AppError('The saved terrain geometry or full project reference evidence is inconsistent. Retain its original revision and review the source.',409,'ROAD_TERRAIN_UNVERIFIED')
  }
}
