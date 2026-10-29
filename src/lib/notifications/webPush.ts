import { createHash, ECDH, createECDH } from 'node:crypto'
import webpush from 'web-push'
import { z } from 'zod'

export function validPushEndpoint(value: string) {
  try {
    const url=new URL(value),host=url.hostname.toLowerCase()
    return url.protocol==='https:' && !url.username && !url.password && !url.port && !url.hash &&
      (host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' ||
       host.endsWith('.push.services.mozilla.com') || host==='web.push.apple.com' ||
       host.endsWith('.push.apple.com') || host==='notify.windows.com' || host.endsWith('.notify.windows.com'))
  } catch { return false }
}
const base64url=z.string().regex(/^[A-Za-z0-9_-]+$/)
export const subscriptionSchema=z.object({
  endpoint:z.string().max(4096).refine(validPushEndpoint,'Unsupported push service'),
  expirationTime:z.number().nullable().optional(),
  keys:z.object({
    p256dh:base64url.refine(value=>{
      try { const key=Buffer.from(value,'base64url'); return key.length===65 && key[0]===4 && ECDH.convertKey(key,'prime256v1').length===65 } catch { return false }
    },'Invalid device key'),
    auth:base64url.refine(value=>Buffer.from(value,'base64url').length===16,'Invalid device authentication key'),
  }).strict(),
}).strict()
export const endpointHash=(endpoint:string)=>createHash('sha256').update(endpoint).digest('hex')
export function pushConfiguration() {
  const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT
  if(!publicKey||!privateKey||!subject)return null
  try {
    if(!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject))return null
    const key=createECDH('prime256v1');key.setPrivateKey(Buffer.from(privateKey,'base64url'))
    if(!key.getPublicKey().equals(Buffer.from(publicKey,'base64url')))return null
    return {publicKey,privateKey,subject}
  } catch { return null }
}
export interface DeviceSubscription { endpoint:string;p256dh:string;auth_key:string }
export async function sendSurveyPush(device:DeviceSubscription,outboxId:string,ttl:number) {
  const config=pushConfiguration()
  if(!config)throw new Error('PUSH_NOT_CONFIGURED')
  // Push services receive an encrypted opaque ID, never project/client details.
  const response=await webpush.sendNotification({
    endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key},
  },JSON.stringify({outboxId}),{vapidDetails:config,TTL:Math.max(0,Math.min(86400,Math.floor(ttl))),urgency:'normal',timeout:10000})
  return response.statusCode
}
