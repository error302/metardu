import { z } from 'zod'
import { canonicalJson } from '@/lib/provenance/canonicalJson'

const receipt=z.object({ok:z.literal(true),id:z.string(),observationId:z.string().uuid(),batchId:z.string().uuid(),inputHash:z.string().regex(/^[a-f0-9]{64}$/),fieldVerified:z.literal(false),replayed:z.boolean()})
export type FieldObservationDeliveryReceipt=z.infer<typeof receipt>
const storedRecord=z.object({id:z.string().uuid()}).passthrough()
export function hasStoredFieldAcknowledgement(value:unknown,expected:Record<string,string>):boolean{
  const parsed=storedRecord.safeParse(value)
  return parsed.success&&Object.entries(expected).every(([key,item])=>parsed.data[key]===item)
}
/** A successful HTTP status alone is not a delivery acknowledgement. */
export function acknowledgeFieldObservation(value:unknown,clientId:string,expectedInputHash:string){
  const parsed=receipt.safeParse(value)
  if(!parsed.success||parsed.data.id!==clientId||parsed.data.inputHash!==expectedInputHash)throw new Error('The server did not acknowledge this exact raw observation. The device copy is still pending.')
  return parsed.data
}

export function offlineObservationSource(input:Record<string,unknown>):Record<string,unknown>{
  return Object.fromEntries(Object.entries(input).filter(([key])=>!['syncedAt','synced','syncError','updated_at','deliveryReceipt','deliveryRetry'].includes(key)))
}
export async function hasAcknowledgedFieldObservation(input:{id:string;syncedAt?:string|null;deliveryReceipt?:unknown}):Promise<boolean>{
  if(!input.syncedAt||!Number.isFinite(Date.parse(input.syncedAt)))return false
  try{acknowledgeFieldObservation(input.deliveryReceipt,input.id,await observationDeliveryHash(input as unknown as Record<string,unknown>));return true}
  catch{return false}
}
export async function observationDeliveryHash(input:Record<string,unknown>):Promise<string>{
  const text=canonicalJson(JSON.parse(JSON.stringify(offlineObservationSource(input))))
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}
