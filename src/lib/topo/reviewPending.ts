import {z} from 'zod'
import {canonicalJson} from '@/lib/provenance/canonicalJson'
import {browserPendingLock,type PendingLock,type PendingStorage} from './surfacePending'
import {surfaceReviewCommandSchema,surfaceReviewReceiptSchema} from './surfaceReviewProtocol'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
const bindingSchema=z.object({ownerId:z.string().guid(),projectId:z.string().guid(),sourceRevisionId:z.string().guid(),sourceHash:hash}).strict()
const pendingSchema=z.object({version:z.literal(1),ownerId:z.string().guid(),createdAt:z.iso.datetime(),
  sourceReferenceHash:hash,sourceOutputHash:hash,command:surfaceReviewCommandSchema}).strict()
export type ReviewBinding=z.infer<typeof bindingSchema>
export type PendingReview=z.infer<typeof pendingSchema>
const key=(binding:ReviewBinding)=>{
  const value=bindingSchema.parse(binding)
  return `metardu:source-review:v1:${value.ownerId}:${value.projectId}:${value.sourceRevisionId}`
}
function matchesBinding(packet:PendingReview,binding:ReviewBinding){
  return packet.ownerId===binding.ownerId&&packet.command.projectId===binding.projectId&&
    packet.command.sourceRevisionId===binding.sourceRevisionId&&packet.command.expectedSourceHash===binding.sourceHash
}
export function readPendingReview(binding:ReviewBinding,storage:PendingStorage=window.localStorage):PendingReview|null{
  const raw=storage.getItem(key(binding))
  if(raw===null)return null
  let packet:PendingReview
  try{packet=pendingSchema.parse(JSON.parse(raw))}catch{throw new Error('The saved review recovery record is invalid. It was preserved; no request was sent.')}
  if(!matchesBinding(packet,binding))throw new Error('The saved review belongs to another account or source. It was preserved; no request was sent.')
  return packet
}
function payload(packet:PendingReview){
  const {requestId: _requestId,...command}=packet.command
  return canonicalJson({ownerId:packet.ownerId,sourceReferenceHash:packet.sourceReferenceHash,sourceOutputHash:packet.sourceOutputHash,command})
}
export async function preparePendingReview(binding:ReviewBinding,input:Omit<PendingReview,'version'|'createdAt'|'ownerId'>,
  storage:PendingStorage=window.localStorage,lock:PendingLock=browserPendingLock):Promise<PendingReview>{
  const name=key(binding)
  return lock(name,()=>{
    const packet=pendingSchema.parse({...input,version:1,ownerId:binding.ownerId,createdAt:new Date().toISOString()})
    if(!matchesBinding(packet,binding))throw new Error('Review request does not match this account and source.')
    const current=readPendingReview(binding,storage)
    if(current){
      if(payload(current)===payload(packet))return current
      throw new Error('Another unconfirmed review is retained for this source. Recover it before submitting different work.')
    }
    storage.setItem(name,canonicalJson(packet))
    const retained=readPendingReview(binding,storage)
    if(!retained||canonicalJson(retained)!==canonicalJson(packet))throw new Error('Device storage did not retain the review. No request was sent.')
    return retained
  })
}
export async function acknowledgePendingReview(binding:ReviewBinding,packet:PendingReview,rawReceipt:unknown,
  storage:PendingStorage=window.localStorage,lock:PendingLock=browserPendingLock):Promise<boolean>{
  const receipt=surfaceReviewReceiptSchema.parse(rawReceipt),command=packet.command
  if(!matchesBinding(packet,binding)||receipt.actorId!==packet.ownerId||receipt.projectId!==command.projectId||receipt.sourceRevisionId!==command.sourceRevisionId||
    receipt.sourceHash!==command.expectedSourceHash||receipt.sourceReferenceHash!==packet.sourceReferenceHash||receipt.sourceOutputHash!==packet.sourceOutputHash||
    receipt.requestId!==command.requestId||receipt.outcome!==command.outcome||receipt.note!==command.note)
    throw new Error('Review acknowledgement does not match the retained request and source evidence. Retry to check the same request.')
  const name=key(binding)
  return lock(name,()=>{
    const current=readPendingReview(binding,storage)
    if(!current)return true // Another tab may already have acknowledged this server-confirmed request.
    if(canonicalJson(current)!==canonicalJson(packet))return false
    storage.removeItem(name)
    if(storage.getItem(name)!==null)throw new Error('The confirmed review recovery record could not be cleared. Retry will reuse its identity.')
    return true
  })
}
