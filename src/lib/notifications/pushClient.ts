'use client'
import { apiPost } from '@/lib/api/client'
import { pushDeviceSchema } from './pushContracts'

export function supportsSurveyPush() {
  return typeof window!=='undefined'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window
}
export async function subscriptionHash(subscription:PushSubscription) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subscription.endpoint))
  return Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('')
}
export async function pushWorkerReady(registration:ServiceWorkerRegistration) {
  const worker=registration.active
  if(!worker)return false
  return new Promise<boolean>(resolve=>{
    const channel=new MessageChannel()
    const finish=(ready:boolean)=>{clearTimeout(timer);channel.port1.close();resolve(ready)}
    const timer=setTimeout(()=>finish(false),2000)
    channel.port1.onmessage=(event:MessageEvent<unknown>)=>{
      const data=event.data
      finish(typeof data==='object'&&data!==null&&'reminderPush'in data&&data.reminderPush===true)
    }
    worker.postMessage({type:'METARDU_PUSH_CAPABILITY'},[channel.port2])
  })
}
export async function readySurveyWorker() {
  const current=await navigator.serviceWorker.getRegistration('/')
  if(current?.active)return current
  return new Promise<ServiceWorkerRegistration|null>(resolve=>{
    const timer=setTimeout(()=>resolve(null),8000)
    navigator.serviceWorker.ready.then(registration=>{clearTimeout(timer);resolve(registration)}).catch(()=>{clearTimeout(timer);resolve(null)})
  })
}
function applicationKey(value:string) {
  const decoded=atob(value.replace(/-/g,'+').replace(/_/g,'/'))
  const buffer=new ArrayBuffer(decoded.length),bytes=new Uint8Array(buffer)
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i)
  return buffer
}
export async function enableSurveyPush(publicKey:string) {
  // Keep this call in the original button gesture for Safari.
  const permission=await Notification.requestPermission()
  if(permission!=='granted')throw new Error('Notifications were not allowed. You can enable them later from this device.')
  const registration=await navigator.serviceWorker.getRegistration('/')
  if(!registration||!await pushWorkerReady(registration))throw new Error('Save your work, then use “Reload when ready” to update METARDU before enabling reminders.')
  const previous=await registration.pushManager.getSubscription()
  if(previous) {
    await apiPost('/api/push/subscriptions/disable',pushDeviceSchema,{endpoint_hash:await subscriptionHash(previous)})
    await previous.unsubscribe()
  }
  const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(publicKey)})
  try { await apiPost('/api/push/subscriptions',pushDeviceSchema,subscription.toJSON()) }
  catch(error) { await subscription.unsubscribe().catch(()=>false);throw error }
  return subscription
}
export async function disableSurveyPush() {
  if(!supportsSurveyPush())return
  const registration=await navigator.serviceWorker.getRegistration('/')
  const subscription=await registration?.pushManager.getSubscription()
  if(!subscription)return
  await apiPost('/api/push/subscriptions/disable',pushDeviceSchema,{endpoint_hash:await subscriptionHash(subscription)})
  await subscription.unsubscribe()
}
/** Explicit sign-out also disconnects this device; no drawing/storage reset. */
export async function disconnectPushBeforeSignOut() {
  try { await disableSurveyPush() } catch {
    try {
      const registration=await navigator.serviceWorker.getRegistration('/')
      const subscription=await registration?.pushManager.getSubscription()
      await subscription?.unsubscribe()
    } catch { /* Reminder content resolution still requires the current signed-in owner. */ }
  }
}
