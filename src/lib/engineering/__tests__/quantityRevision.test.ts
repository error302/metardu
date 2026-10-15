/** @jest-environment node */
import {recordDesignRevision,hashDesignPayload} from '../designRevisions'
import {createHash} from 'node:crypto'
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/observations/observationBatches',()=>({recordEvidenceEvent:jest.fn()}))

it('keeps repeated quantity recordings as drafts without submitting them for review',async()=>{
  const query=jest.fn(async(sql:string,params:unknown[]=[])=>{
    if(sql.includes('FROM design_revisions'))return{rows:[{id:'prior',revision_number:1,revision:'R01',status:'DRAFT'}]}
    if(sql.includes('INSERT INTO design_revisions'))return{rows:[{id:'next',status:params[6],revision:params[4]}]}
    return{rows:[]}
  })
  const result=await recordDesignRevision({projectId:'project',entityType:'alignment-earthworks',draftOnly:true,payload:{zero:0}}, {query} as unknown as import('pg').PoolClient)
  expect(result.revision.status).toBe('DRAFT')
  expect(result.revision.revision).toBe('R02')
})
it('preserves the established revision hash across JSON object key order',()=>{
  const digest=createHash('sha256').update('{"a":{"x":0,"z":-1},"b":[1,2]}').digest('hex')
  expect(hashDesignPayload({b:[1,2],a:{z:-1,x:0}})).toBe(digest)
  expect(hashDesignPayload({a:{x:0,z:-1},b:[1,2]})).toBe(digest)
})
