/** @jest-environment node */
import type {PoolClient} from 'pg'
import {civilSurfaceFixture,projectId,revisionId,ownerId} from './civil-surface-fixture'
import {loadRoadRetainedTerrain} from '@/lib/engineering/roadTerrainServer'
jest.mock('@/lib/db',()=>({db:{}}))
let fixture=civilSurfaceFixture(),owner=ownerId,reference:unknown=fixture.result.snapshot.reference
const query=jest.fn(async(sql:string)=>{
  if(sql.includes('SELECT user_id FROM projects'))return{rows:[{user_id:owner}]}
  if(sql.includes('FROM project_reference_systems'))return{rows:[reference]}
  return{rows:[fixture]}
})
const client={query} as unknown as PoolClient
beforeEach(()=>{query.mockClear();fixture=civilSurfaceFixture();owner=ownerId;reference=fixture.result.snapshot.reference})
it('loads the exact retained mesh and reference identity without creating a new surface',async()=>{
  const data=await loadRoadRetainedTerrain(client,ownerId,projectId,revisionId)
  expect(data.identity).toMatchObject({projectId,revisionId,fieldVerified:false,meshHash:fixture.result.outputIntegrity.meshHash})
  expect(data.mesh).toEqual({points:fixture.result.mesh.points,triangles:fixture.result.mesh.triangles})
  expect(query.mock.calls.some(([sql])=>/^\s*(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false)
})
it('refuses another owner before reading the terrain revision',async()=>{
  owner='another-owner'
  await expect(loadRoadRetainedTerrain(client,ownerId,projectId,revisionId)).rejects.toMatchObject({statusCode:403})
  expect(query).toHaveBeenCalledTimes(1)
})
it('refuses a surface when the full declared project reference changed',async()=>{
  reference={...(fixture.result.snapshot.reference as Record<string,unknown>),vertical_datum:'Different height basis'}
  await expect(loadRoadRetainedTerrain(client,ownerId,projectId,revisionId)).rejects.toThrow(/reference/i)
})
it.each(['project','revision','mesh'])('refuses inconsistent %s evidence',async kind=>{
  if(kind==='project')fixture.project_id=ownerId
  if(kind==='revision')fixture.revision_id=ownerId
  if(kind==='mesh')fixture.result.mesh.points[0].z=100
  await expect(loadRoadRetainedTerrain(client,ownerId,projectId,revisionId)).rejects.toThrow()
})
