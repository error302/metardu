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
it('leaves existing direct input semantics explicit when no snapshot is supplied',async()=>{
  expect(await verifyAlignmentMirrorSnapshot(client,alignment,undefined)).toBe(false)
  expect(query).not.toHaveBeenCalled()
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
