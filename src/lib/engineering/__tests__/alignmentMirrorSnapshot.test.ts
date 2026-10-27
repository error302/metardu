/** @jest-environment node */
import type { PoolClient } from 'pg'
import { verifyAlignmentMirrorSnapshot, syncAlignmentProjectInputs } from '../alignmentProjectSync'
import { hashDesignPayload } from '../designRevisions'
import type { OwnedAlignment } from '../alignmentAccess'
jest.mock('@/lib/db',()=>({db:{}}))
const engineering={mode:'road',road:{roadName:'Synthetic road',ips:[]},unrelated:{retained:true}}
const alignment:OwnedAlignment={id:'alignment',project_id:'project',road_name:'Synthetic road',project_owner:'owner',start_chainage:0,coordinate_system:'EPSG:32737'}
const query=jest.fn<Promise<{rows:Array<Record<string,unknown>>}>,[string,unknown[]?]>()
const client={query} as unknown as PoolClient
beforeEach(()=>{query.mockReset();query.mockResolvedValue({rows:[{engineering_data:engineering}]})})
it('refuses a blind legacy write when a canonical engineering draft exists',async()=>{
  await expect(verifyAlignmentMirrorSnapshot(client,alignment,undefined)).rejects.toMatchObject({statusCode:409,code:'ENGINEERING_SNAPSHOT_REQUIRED'})
  expect(query).toHaveBeenCalledTimes(1)
})
it('retains the standalone alignment path only when the project has no engineering draft',async()=>{
  query.mockResolvedValueOnce({rows:[{engineering_data:null}]})
  expect(await verifyAlignmentMirrorSnapshot(client,alignment,undefined)).toBe(false)
  expect(query.mock.calls[0][1]).toEqual(['project'])
})
it('does not treat a missing project as an uninitialized engineering draft',async()=>{
  query.mockResolvedValueOnce({rows:[]})
  await expect(verifyAlignmentMirrorSnapshot(client,alignment,undefined)).rejects.toThrow()
})
it('verifies the exact project snapshot before allowing a mirror-only copy',async()=>{
  expect(await verifyAlignmentMirrorSnapshot(client,alignment,hashDesignPayload({engineering}))).toBe(true)
  expect(query.mock.calls[0][1]).toEqual(['project'])
})
it('refuses a delayed mirror copy after a newer engineering save',async()=>{
  await expect(verifyAlignmentMirrorSnapshot(client,alignment,'a'.repeat(64))).rejects.toThrow(/changed/i)
  expect(query.mock.calls.some(([sql])=>/^\s*(UPDATE|INSERT|DELETE)/.test(String(sql)))).toBe(false)
})
it('refuses lossy or absent project JSON instead of copying against a coerced hash',async()=>{
  query.mockResolvedValueOnce({rows:[{engineering_data:{bad:Infinity}}]}).mockResolvedValueOnce({rows:[]})
  await expect(verifyAlignmentMirrorSnapshot(client,alignment,'a'.repeat(64))).rejects.toThrow()
  await expect(verifyAlignmentMirrorSnapshot(client,alignment,'a'.repeat(64))).rejects.toThrow()
})
it('never writes back into the canonical project in verified mirror-only mode',async()=>{
  await syncAlignmentProjectInputs(client,alignment,'ips',[],true)
  expect(query).not.toHaveBeenCalled()
})
it('refuses the obsolete sync-back path when a canonical draft exists',async()=>{
  await expect(syncAlignmentProjectInputs(client,alignment,'ips',[])).rejects.toMatchObject({code:'ENGINEERING_SNAPSHOT_REQUIRED'})
  expect(query.mock.calls.some(([sql])=>/^\s*(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false)
})
it('does not create project JSON while saving a standalone legacy alignment',async()=>{
  query.mockResolvedValue({rows:[{engineering_data:null}]})
  await syncAlignmentProjectInputs(client,alignment,'ips',[])
  expect(query.mock.calls.some(([sql])=>/^\s*(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false)
})
