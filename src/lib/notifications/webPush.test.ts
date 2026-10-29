/** @jest-environment node */
import { createECDH, randomBytes } from 'node:crypto'
import { validPushEndpoint, subscriptionSchema, pushConfiguration } from './webPush'
it.each(['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test','https://a.notify.windows.com/test'])('accepts recognized HTTPS push service %s',url=>expect(validPushEndpoint(url)).toBe(true))
it.each(['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.invalid/a','https://127.0.0.1/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://fcm.googleapis.com/a#fragment','https://evil.invalid/push.apple.com'])('rejects endpoint SSRF and lookalikes %s',url=>expect(validPushEndpoint(url)).toBe(false))
it('validates curve keys and authentication length',()=>{
 const key=createECDH('prime256v1');key.generateKeys()
 const value={endpoint:'https://web.push.apple.com/synthetic',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}
 expect(subscriptionSchema.safeParse(value).success).toBe(true)
 expect(subscriptionSchema.safeParse({...value,keys:{...value.keys,p256dh:Buffer.alloc(65,4).toString('base64url')}}).success).toBe(false)
 expect(subscriptionSchema.safeParse({...value,keys:{...value.keys,auth:'short'}}).success).toBe(false)
})
it('fails closed on incomplete or mismatched VAPID configuration',()=>{
 const saved={...process.env}
 try{
  delete process.env.VAPID_PUBLIC_KEY;expect(pushConfiguration()).toBeNull()
  const key=createECDH('prime256v1');key.generateKeys()
  process.env.VAPID_PUBLIC_KEY=key.getPublicKey().toString('base64url')
  process.env.VAPID_PRIVATE_KEY=key.getPrivateKey().toString('base64url')
  process.env.VAPID_SUBJECT='mailto:hello@example.invalid'
  expect(pushConfiguration()).not.toBeNull()
  process.env.VAPID_PRIVATE_KEY=randomBytes(32).toString('base64url')
  expect(pushConfiguration()).toBeNull()
 }finally{process.env=saved}
})
