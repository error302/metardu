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
export async function pushWorkerReady(registration:ServiceWorkerRegistration,{signal}:{signal?:AbortSignal}={}) {
  const worker=registration.active
  if(!worker||signal?.aborted)return false
  return new Promise<boolean>(resolve=>{
    const channel=new MessageChannel()
    let finished=false
    const finish=(ready:boolean)=>{
      if(finished)return
      finished=true;clearTimeout(timer);channel.port1.onmessage=null;channel.port1.close();signal?.removeEventListener('abort',abort);resolve(ready)
    }
    const abort=()=>finish(false)
    const timer=setTimeout(()=>finish(false),2000)
    signal?.addEventListener('abort',abort,{once:true})
    channel.port1.onmessage=(event:MessageEvent<unknown>)=>{
      const data=event.data
      finish(typeof data==='object'&&data!==null&&'reminderPush'in data&&data.reminderPush===true)
    }
    try{worker.postMessage({type:'METARDU_PUSH_CAPABILITY'},[channel.port2])}catch{finish(false)}
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
/** Check/download an update only; activation and permission still require separate gestures. */
export async function checkSurveyWorkerUpdate({signal,timeoutMs=15000}:{signal?:AbortSignal;timeoutMs?:number}={}):Promise<'ready'|'waiting'> {
  const controller=new AbortController()
  const aborted=()=>controller.abort()
  signal?.addEventListener('abort',aborted,{once:true})
  if(signal?.aborted)controller.abort()
  let timedOut=false
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},timeoutMs)
  const cancelled=()=>new Error(timedOut?'App update check timed out. Your page has not reloaded; try again when connected.':'App update check cancelled. Your page has not reloaded.')
  const current=()=>{if(controller.signal.aborted)throw cancelled()}
  let removeAbort=()=>{}
  const cancellation=new Promise<never>((_,reject)=>{
    const cancel=()=>reject(cancelled())
    controller.signal.addEventListener('abort',cancel,{once:true})
    removeAbort=()=>controller.signal.removeEventListener('abort',cancel)
    if(controller.signal.aborted)cancel()
  })
  const check=async():Promise<'ready'|'waiting'>=>{
    current()
    const registration=await navigator.serviceWorker.getRegistration('/')
    current()
    if(!registration)throw new Error('The app installation is still initializing. Keep this page open and check again when connected.')
    if(await pushWorkerReady(registration,{signal:controller.signal}))return 'ready'
    current()
    if(registration.waiting)return 'waiting'
    await registration.update()
    current()
    const installing=registration.installing
    if(installing&&!['installed','activated','redundant'].includes(installing.state)){
      await new Promise<void>((resolve,reject)=>{
        const cleanup=()=>{installing.removeEventListener('statechange',changed);controller.signal.removeEventListener('abort',cancel)}
        const changed=()=>{if(['installed','activated','redundant'].includes(installing.state)){cleanup();resolve()}}
        const cancel=()=>{cleanup();reject(cancelled())}
        installing.addEventListener('statechange',changed)
        controller.signal.addEventListener('abort',cancel,{once:true})
        if(controller.signal.aborted)cancel();else changed()
      })
    }
    current()
    if(registration.waiting)return 'waiting'
    const capable=await pushWorkerReady(registration,{signal:controller.signal})
    current()
    if(capable)return 'ready'
    throw new Error('No reminder-capable app update is ready yet. Check your connection and try again.')
  }
  try{return await Promise.race([check(),cancellation])}
  catch(error){if(controller.signal.aborted)throw cancelled();throw error instanceof Error&&/^(The app installation|No reminder-capable)/.test(error.message)?error:new Error('App update could not be checked. Your page has not reloaded; try again when connected.')}
  finally{clearTimeout(timer);removeAbort();signal?.removeEventListener('abort',aborted);controller.abort()}
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
