import {readPendingReview,preparePendingReview,acknowledgePendingReview,type ReviewBinding} from '../reviewPending'
import type {PendingLock,PendingStorage} from '../surfacePending'
const ownerId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',sourceRevisionId='33333333-3333-4333-8333-333333333333'
const binding:ReviewBinding={ownerId,projectId,sourceRevisionId,sourceHash:'a'.repeat(64)}
const input=(requestId='44444444-4444-4444-8444-444444444444')=>({sourceReferenceHash:'b'.repeat(64),sourceOutputHash:'c'.repeat(64),command:{projectId,sourceRevisionId,expectedSourceHash:binding.sourceHash,requestId,outcome:'changes_requested' as const,note:'Check benchmark closure.'}})
function device(){
  const records=new Map<string,string>()
  const storage:PendingStorage={getItem:key=>records.get(key)??null,setItem:(key,value)=>{records.set(key,value)},removeItem:key=>{records.delete(key)}}
  let tail:Promise<unknown>=Promise.resolve()
  const lock:PendingLock=(key,work)=>{const next=tail.then(work);tail=next.catch(()=>undefined);return next}
  return {records,storage,lock}
}
const receipt=(request=input())=>({id:'55555555-5555-4555-8555-555555555555',actorId:ownerId,projectId,sourceRevisionId,sourceHash:binding.sourceHash,
  sourceReferenceHash:request.sourceReferenceHash,sourceOutputHash:request.sourceOutputHash,requestId:request.command.requestId,outcome:request.command.outcome,note:request.command.note,
  createdAt:'2026-11-06T09:00:00.000Z',replayed:true,professionalApproval:false,fieldVerified:false})

test('two tabs serialize equivalent work onto one retained request identity',async()=>{
  const {records,storage,lock}=device()
  const [first,second]=await Promise.all([preparePendingReview(binding,input(),storage,lock),preparePendingReview(binding,input('66666666-6666-4666-8666-666666666666'),storage,lock)])
  expect(first).toEqual(second);expect(records.size).toBe(1)
  expect(readPendingReview(binding,storage)).toEqual(first)
})
test('different review notes cannot overwrite unconfirmed work',async()=>{
  const {storage,lock}=device(),first=await preparePendingReview(binding,input(),storage,lock)
  await expect(preparePendingReview(binding,{...input(),command:{...input().command,note:'Different review'}},storage,lock)).rejects.toThrow('unconfirmed')
  expect(readPendingReview(binding,storage)).toEqual(first)
})
test('corrupt recovery data is retained and blocks replacement',async()=>{
  const {records,storage,lock}=device()
  await preparePendingReview(binding,input(),storage,lock)
  const name=[...records.keys()][0];records.set(name,'{not json')
  await expect(preparePendingReview(binding,input(),storage,lock)).rejects.toThrow('invalid')
  expect(records.get(name)).toBe('{not json')
})
test('a request substituted into another account or revision key is refused',async()=>{
  const {records,storage,lock}=device()
  await preparePendingReview(binding,input(),storage,lock)
  const name=[...records.keys()][0],raw=records.get(name)
  if(raw===undefined)throw new Error('Recovery fixture was not retained')
  records.set(name,JSON.stringify({...JSON.parse(raw),ownerId:'66666666-6666-4666-8666-666666666666'}))
  expect(()=>readPendingReview(binding,storage)).toThrow('another account or source')
  expect(readPendingReview({...binding,ownerId:'66666666-6666-4666-8666-666666666666'},storage)).toBeNull()
})
test('storage that silently loses a write cannot authorize submission',async()=>{
  const {storage,lock}=device()
  storage.setItem=()=>undefined
  await expect(preparePendingReview(binding,input(),storage,lock)).rejects.toThrow('did not retain')
})
test.each(['actorId','requestId','sourceRevisionId','sourceReferenceHash','sourceOutputHash','note'] as const)('a mismatched %s cannot acknowledge recovery',async(field)=>{
  const {storage,lock}=device(),packet=await preparePendingReview(binding,input(),storage,lock)
  const invalid={...receipt(),[field]:field.endsWith('Hash')?'d'.repeat(64):field==='note'?'Unrelated text':'66666666-6666-4666-8666-666666666666'}
  await expect(acknowledgePendingReview(binding,packet,invalid,storage,lock)).rejects.toThrow('does not match')
  expect(readPendingReview(binding,storage)).toEqual(packet)
})
test('a late acknowledgement cannot clear a newer request retained by another tab',async()=>{
  const {storage,lock}=device(),first=await preparePendingReview(binding,input(),storage,lock)
  expect(await acknowledgePendingReview(binding,first,receipt(),storage,lock)).toBe(true)
  const nextInput=input('66666666-6666-4666-8666-666666666666')
  const second=await preparePendingReview(binding,nextInput,storage,lock)
  expect(await acknowledgePendingReview(binding,first,receipt(),storage,lock)).toBe(false)
  expect(readPendingReview(binding,storage)).toEqual(second)
})
test('failure to clear a confirmed packet retains its identity for safe replay',async()=>{
  const {storage,lock}=device(),packet=await preparePendingReview(binding,input(),storage,lock)
  storage.removeItem=()=>undefined
  await expect(acknowledgePendingReview(binding,packet,receipt(),storage,lock)).rejects.toThrow('could not be cleared')
  expect(readPendingReview(binding,storage)).toEqual(packet)
})
test('browsers without Web Locks cannot start an unprotected request',async()=>{
  const {storage}=device()
  Object.defineProperty(navigator,'locks',{value:undefined,configurable:true})
  await expect(preparePendingReview(binding,input(),storage)).rejects.toThrow('session lock is unavailable')
  expect(readPendingReview(binding,storage)).toBeNull()
})
