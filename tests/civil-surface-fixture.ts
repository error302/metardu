import {createHash} from 'node:crypto'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {buildProjectReferenceSystem,toReferenceSystemRow,fromReferenceSystemRow} from '@/lib/spatial/projectReferenceSystem'
export const projectId='10000000-0000-4000-8000-000000000001',revisionId='10000000-0000-4000-8000-000000000002',ownerId='10000000-0000-4000-8000-000000000003'
const fixtureGrid='EPSG:32737'
export const civilHash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex')
export function civilSurfaceFixture(){
  const reference=toReferenceSystemRow(projectId,{prs:buildProjectReferenceSystem({datum:'WGS84',utmZone:37,hemisphere:'S',verticalDatum:'SYNTHETIC local BM',verticalReference:'local'})},ownerId)
  const mesh={points:[{x:500000,y:9800000,z:0},{x:500010,y:9800000,z:1},{x:500000,y:9800010,z:2},{x:500010,y:9800010,z:3}],triangles:[{a:0,b:1,c:2},{a:1,b:3,c:2}],constraintEdges:[[0,1]]}
  const observations=mesh.points.map((point,index)=>({...point,id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,pointName:`SYNTHETIC ${index+1}`,horizontalCrs:fixtureGrid,verticalDatum:'SYNTHETIC local BM',code:null}))
  const parameters={interval:1,maxVertexSpacing:1,indexInterval:5}
  const snapshot=JSON.parse(JSON.stringify({schemaVersion:2,sourceAdmissionVersion:'surface-source-v2',hashAlgorithm:'sha256-canonical-json-v1',reference,referenceHash:civilHash(fromReferenceSystemRow(reference)),observations,sourceSelection:{mode:'explicit_point_ids',pointIds:observations.map(p=>p.id)},parameters,fieldVerified:false})) as Record<string,unknown>
  return {surface_id:'10000000-0000-4000-8000-000000000004',revision_id:revisionId,project_id:projectId,project_name:'SYNTHETIC surface project',user_id:ownerId,name:'SYNTHETIC retained terrain',revision:2,crs:'EPSG:32737',point_count:4,triangle_count:2,input_hash:civilHash(snapshot),parameters,result:{snapshot,mesh,outputIntegrity:{algorithm:'sha256-canonical-json-v1',meshHash:civilHash(mesh)}}}
}

export function clippedCivilSurfaceFixture(){
  const base=civilSurfaceFixture(),sourceMesh=structuredClone(base.result.mesh)
  const outer=[[500000,9800000],[500010,9800000],[500010,9800010],[500000,9800010]]
  const hole=[[500003,9800003],[500007,9800003],[500007,9800007],[500003,9800007]]
  const points=[...outer,...hole].map(([x,y])=>({x,y,z:(x-500000)/10+(y-9800000)/5}))
  const mesh={points,triangles:[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a,b,c])=>({a,b,c})),
    heightBasis:'retained_parent_tin_faces',vertexOrigins:points.map((_,i)=>i<4?{kind:'retained_tin_vertex',vertex:[0,1,3,2][i]}:{kind:'derived_clip_vertex',triangle:i===6?1:0})}
  const terrainDomain={horizontalCrs:'EPSG:32737',sourceLabel:'SYNTHETIC annulus',regions:[{outer:outer.map(([x,y])=>({x,y})),holes:[hole.map(([x,y])=>({x,y}))]}]}
  const snapshot={...base.result.snapshot,terrainDomain}
  const domain={area:84,definitionHash:civilHash(terrainDomain),derivedVertexCount:4}
  return {...base,triangle_count:8,input_hash:civilHash(snapshot),result:{snapshot,mesh,sourceMesh,domain,
    outputIntegrity:{algorithm:'sha256-canonical-json-v1',meshHash:civilHash(mesh),sourceMeshHash:civilHash(sourceMesh),domainHash:civilHash(domain)}}}
}
