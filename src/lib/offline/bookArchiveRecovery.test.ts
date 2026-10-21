/** @jest-environment node */
import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { createHash } from 'node:crypto'
import { canonicalDeliveryJson, fieldbookEditablePayload, type FieldbookSaveRequest } from '@/lib/fieldbook/delivery'
import { retainBookEdit, listBookEdits, exportBookEditRecords, findBookEdit, sendBookEdit, type BookEdit } from './bookEdits'
import { retainBookRequest, exportBookRequestRecords, sendRetainedBookRequest, listBookRequests } from './bookDeliveryJournal'
import { BOOK_ARCHIVE_MAX_BYTES, previewBookArchive, restoreBookArchive, listBookArchives, readBookArchive } from './bookArchiveRecovery'

const actor='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222', book='33333333-3333-4333-8333-333333333333'
const edit: BookEdit={requestId:'44444444-4444-4444-8444-444444444444',projectId:project,bookId:book,type:'leveling',name:'Synthetic café run',basis:{kind:'new'},
  data:JSON.parse('{"bs":"1.5000","height":null,"zero":0,"__proto__":{"raw":"keep"}}') as BookEdit['data']}
const sha=(v:Parameters<typeof canonicalDeliveryJson>[0])=>createHash('sha256').update(canonicalDeliveryJson(v)).digest('hex')
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value,null,2))
const archive=(edits:unknown[]=[],requests:unknown[]=[],legacy:unknown[]=[])=>({version:1,actorId:actor,projectId:project,edits,requests,legacy})
const envelope=(value:BookEdit)=>({version:1,key:`${actor}:${value.requestId}`,actorId:actor,projectId:project,edit:value,hash:sha(value)})
const request=(value=edit,baseRevision:string|null=null):FieldbookSaveRequest=>{const{basis:_basis,...raw}=value;return{...raw,protocol:'fieldbook-save-v1',baseRevision}}
const requestEnvelope=(value=request())=>({version:1,key:`${actor}:${value.requestId}`,actorId:actor,request:value,requestHash:sha(value),result:null})
const originalFetch=global.fetch
beforeEach(async()=>{for(const name of ['metardu-book-edits','metardu-book-delivery-journal','metardu-book-recovery-archives'])await deleteDB(name);global.fetch=jest.fn()})
afterEach(()=>jest.restoreAllMocks())
afterAll(()=>{global.fetch=originalFetch})
function response(revision='8') {return async(_url:unknown,options?:RequestInit)=>{
 const input=JSON.parse(String(options?.body)) as FieldbookSaveRequest
 return new Response(JSON.stringify({receipt:{protocol:input.protocol,fieldVerified:false,actorId:actor,projectId:project,bookId:input.bookId,requestId:input.requestId,
 inputHash:sha(input),payloadHash:sha(fieldbookEditablePayload(actor,input)),baseRevision:input.baseRevision,savedRevision:revision},book:{...fieldbookEditablePayload(actor,input),status:'active',revision,created_at:null,updated_at:null},currentRevision:revision,replayed:true}),{status:200})
}}

test('a real exported archive restores exact pending work on an empty device and requires a new server acknowledgement',async()=>{
 await retainBookEdit(actor,edit);await retainBookRequest(actor,request())
 jest.mocked(fetch).mockImplementation(response());await sendRetainedBookRequest(actor,project,edit.requestId)
 const source=bytes(archive(await exportBookEditRecords(actor,project),await exportBookRequestRecords(actor,project)))
 await deleteDB('metardu-book-edits');await deleteDB('metardu-book-delivery-journal');jest.mocked(fetch).mockClear()
 const preview=await previewBookArchive(actor,project,source)
 expect(preview).toMatchObject({hash:createHash('sha256').update(source).digest('hex'),edits:1,requests:1,legacy:0,unreadable:0})
 expect(await restoreBookArchive(actor,project,source,preview.hash)).toMatchObject({complete:true})
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
 expect(await listBookEdits(actor,project)).toEqual([{edit,result:null}])
 expect(await listBookRequests(actor,project)).toMatchObject([{request:request(),result:null}])
 expect(fetch).not.toHaveBeenCalled()
 await sendBookEdit(actor,project,edit.requestId)
 expect(await listBookEdits(actor,project)).toMatchObject([{result:{receipt:{savedRevision:'8',fieldVerified:false}}}])
})

test('an imported fabricated receipt remains inspection material and cannot acknowledge a restored request',async()=>{
 const untrusted={...requestEnvelope(),result:{receipt:{fieldVerified:true,savedRevision:'900000'}}}
 const source=bytes(archive([envelope(edit)],[untrusted])),preview=await previewBookArchive(actor,project,source)
 await restoreBookArchive(actor,project,source,preview.hash)
 expect(await listBookRequests(actor,project)).toMatchObject([{result:null}])
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
 expect(fetch).not.toHaveBeenCalled()
})

test('a matching verified local receipt survives repeated restoration without adopting the file result',async()=>{
 await retainBookEdit(actor,edit);await retainBookRequest(actor,request())
 jest.mocked(fetch).mockImplementation(response());await sendRetainedBookRequest(actor,project,edit.requestId)
 const before=await exportBookRequestRecords(actor,project)
 const source=bytes(archive([envelope(edit)],[{...requestEnvelope(),result:'untrusted file claim'}])),preview=await previewBookArchive(actor,project,source)
 jest.mocked(fetch).mockClear()
 await restoreBookArchive(actor,project,source,preview.hash);await restoreBookArchive(actor,project,source,preview.hash)
 expect(await exportBookRequestRecords(actor,project)).toEqual(before)
 expect(await listBookEdits(actor,project)).toHaveLength(1)
 expect(await listBookArchives(actor,project)).toHaveLength(1)
 expect(fetch).not.toHaveBeenCalled()
})

test('a late identity collision is preflighted before any journal write and the original source remains retained',async()=>{
 const later={...edit,requestId:'55555555-5555-4555-8555-555555555555'}
 await retainBookEdit(actor,{...later,data:{bs:'9.9999'}})
 const source=bytes(archive([envelope(edit),envelope(later)])),preview=await previewBookArchive(actor,project,source)
 await expect(restoreBookArchive(actor,project,source,preview.hash)).rejects.toThrow(/different|conflict/i)
 expect(await findBookEdit(actor,project,edit.requestId)).toBeNull()
 expect(await findBookEdit(actor,project,later.requestId)).toMatchObject({data:{bs:'9.9999'}})
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
 expect(await listBookArchives(actor,project)).toMatchObject([{complete:false}])
})

test('storage interruption preserves the source and completed records, then resumes without duplicates',async()=>{
 const later={...edit,requestId:'55555555-5555-4555-8555-555555555555'}
 const source=bytes(archive([envelope(edit),envelope(later)])),preview=await previewBookArchive(actor,project,source)
 const original=IDBObjectStore.prototype.add;let writes=0
 const fault=jest.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){
  if(this.name==='edits'&&++writes===2)throw new DOMException('Device storage full','QuotaExceededError')
  return original.apply(this,args)
 })
 await expect(restoreBookArchive(actor,project,source,preview.hash)).rejects.toThrow('Device storage full')
 fault.mockRestore()
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
 expect(await listBookEdits(actor,project)).toHaveLength(1)
 expect(await listBookArchives(actor,project)).toMatchObject([{complete:false}])
 await restoreBookArchive(actor,project,source,preview.hash)
 expect(await listBookEdits(actor,project)).toHaveLength(2)
 expect(await listBookArchives(actor,project)).toMatchObject([{complete:true}])
 expect(fetch).not.toHaveBeenCalled()
})

test('a preview changed before confirmation cannot restore or retain a different file under the reviewed hash',async()=>{
 const source=bytes(archive([envelope(edit)])),preview=await previewBookArchive(actor,project,source)
 const changed=bytes(archive([envelope({...edit,name:'Changed after review'})]))
 await expect(restoreBookArchive(actor,project,changed,preview.hash)).rejects.toThrow(/review|changed|hash/i)
 expect(await listBookArchives(actor,project)).toEqual([])
 expect(await listBookEdits(actor,project)).toEqual([])
})

test('the input bytes are snapshotted before asynchronous hashing can yield to caller mutation',async()=>{
 const source=bytes(archive([envelope(edit)])),copy=source.slice(),preview=await previewBookArchive(actor,project,source)
 const restoring=restoreBookArchive(actor,project,source,preview.hash)
 source.fill(0)
 await restoring
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(copy)
})

test('another account, project or explicit foreign record cannot be silently reassigned',async()=>{
 const source=bytes(archive([envelope(edit)]))
 await expect(previewBookArchive(book,project,source)).rejects.toThrow()
 await expect(previewBookArchive(actor,book,source)).rejects.toThrow()
 await expect(previewBookArchive(actor,project,bytes(archive([{...envelope(edit),actorId:book}])))).rejects.toThrow()
 expect(await listBookArchives(book,project)).toEqual([])
 expect(await listBookEdits(actor,project)).toEqual([])
})

test('orphan requests retain their exact dispatch identity and raw baseline, while unknown legacy material stays inspection-only',async()=>{
 const legacy=[{id:4,type:'UPSERT',table:'fieldbooks',projectId:project,data:{id:book,user_id:actor,project_id:project,name:'Legacy raw',type:'leveling',data:{bs:'0.0000',height:null}},fieldbookRecovery:{fieldVerified:true}},
 {id:5,table:'fieldbooks',projectId:project,data:{user_id:actor,project_id:project,opaque:'unknown retained bytes'}}]
 const source=bytes(archive([],[requestEnvelope(request(edit,'7'))],legacy)),preview=await previewBookArchive(actor,project,source)
 expect(preview).toMatchObject({requests:1,legacy:1,unreadable:1})
 await restoreBookArchive(actor,project,source,preview.hash);await restoreBookArchive(actor,project,source,preview.hash)
 const restored=await listBookEdits(actor,project)
 expect(restored).toHaveLength(2)
 expect(restored.find(v=>v.edit.requestId===edit.requestId)).toMatchObject({edit:{basis:{kind:'retained_request'}},result:null})
 const old=restored.find(v=>v.edit.name==='Legacy raw')
 expect(old).toMatchObject({edit:{basis:{kind:'unknown'},data:{bs:'0.0000',height:null}},result:null})
 if(!old)throw new Error('Missing recovered legacy content')
 await expect(sendBookEdit(actor,project,old.edit.requestId)).rejects.toThrow()
 expect(fetch).not.toHaveBeenCalled()
 jest.mocked(fetch).mockImplementation(response());await sendBookEdit(actor,project,edit.requestId)
 expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({baseRevision:'7',requestId:edit.requestId})
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
})

test('unreadable owned records remain in the exact source archive without fake success for their content',async()=>{
 const source=bytes(archive([{...envelope(edit),hash:'a'.repeat(64)}])),preview=await previewBookArchive(actor,project,source)
 expect(preview).toMatchObject({edits:0,unreadable:1})
 expect(await restoreBookArchive(actor,project,source,preview.hash)).toMatchObject({complete:true,unreadable:1})
 expect(await listBookEdits(actor,project)).toEqual([])
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
})

test('unsupported, excessive and malformed UTF-8 input is refused before storage writes',async()=>{
 for(const source of [new Uint8Array([0xc3,0x28]),new Uint8Array(BOOK_ARCHIVE_MAX_BYTES+1),bytes({...archive(),version:2}),bytes(archive(Array(10001).fill(null)))]) {
  await expect(previewBookArchive(actor,project,source)).rejects.toThrow()
 }
 expect(await listBookArchives(actor,project)).toEqual([]);expect(await listBookEdits(actor,project)).toEqual([])
})

test('source retention failure cannot write either journal',async()=>{
 const source=bytes(archive([envelope(edit)],[requestEnvelope()])),preview=await previewBookArchive(actor,project,source)
 const original=IDBObjectStore.prototype.add
 const fault=jest.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){
  if(this.name==='archives')throw new DOMException('Archive storage full','QuotaExceededError')
  return original.apply(this,args)
 })
 await expect(restoreBookArchive(actor,project,source,preview.hash)).rejects.toThrow('Archive storage full');fault.mockRestore()
 expect(await listBookEdits(actor,project)).toEqual([]);expect(await listBookRequests(actor,project)).toEqual([])
})

test('ancestry and exact BOM bytes survive restore and child delivery uses a fresh parent receipt',async()=>{
 const child={...edit,requestId:'55555555-5555-4555-8555-555555555555',basis:{kind:'operation' as const,requestId:edit.requestId},data:{bs:'2.0000',height:null}}
 const encoded=bytes(archive([envelope(child),envelope(edit)])),source=new Uint8Array([0xef,0xbb,0xbf,...encoded]),preview=await previewBookArchive(actor,project,source)
 await restoreBookArchive(actor,project,source,preview.hash)
 expect(await readBookArchive(actor,project,preview.hash)).toEqual(source)
 jest.mocked(fetch).mockImplementationOnce(response('8')).mockImplementationOnce(response('9'));await sendBookEdit(actor,project,child.requestId)
 expect(jest.mocked(fetch).mock.calls.map(call=>JSON.parse(String(call[1]?.body)) as unknown)).toMatchObject([{requestId:edit.requestId,baseRevision:null},{requestId:child.requestId,baseRevision:'8'}])
})

test('a completed restore rechecks missing journals, and concurrent resumes share stable legacy identities',async()=>{
 const legacy=[{type:'UPSERT',table:'fieldbooks',projectId:project,data:{id:book,user_id:actor,project_id:project,name:'Retained legacy',type:'leveling',data:{bs:'0.0000'}}}]
 const source=bytes(archive([envelope(edit)],[],legacy)),preview=await previewBookArchive(actor,project,source)
 await restoreBookArchive(actor,project,source,preview.hash);const first=await listBookEdits(actor,project)
 await deleteDB('metardu-book-edits')
 await Promise.all([restoreBookArchive(actor,project,source,preview.hash),restoreBookArchive(actor,project,source,preview.hash)])
 expect(await listBookEdits(actor,project)).toEqual(first)
 expect(await listBookArchives(actor,project)).toMatchObject([{complete:true}]);expect(fetch).not.toHaveBeenCalled()
})

test('corrupt staged identities fail closed and do not replace retained work',async()=>{
 const source=bytes(archive([envelope(edit)])),preview=await previewBookArchive(actor,project,source)
 await restoreBookArchive(actor,project,source,preview.hash);await deleteDB('metardu-book-edits')
 const db=await openDB('metardu-book-recovery-archives'),key=`${actor}:${project}:${preview.hash}`
 const retained=await db.get('archives',key) as Record<string,unknown>
 await db.put('archives',{...retained,bindingsHash:'0'.repeat(64)});db.close()
 await expect(restoreBookArchive(actor,project,source,preview.hash)).rejects.toThrow(/verified/i)
 expect(await listBookEdits(actor,project)).toEqual([]);expect(fetch).not.toHaveBeenCalled()
})
