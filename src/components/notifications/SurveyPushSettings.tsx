'use client'
import { useEffect,useState } from 'react'
import Link from 'next/link'
import { BellRing } from 'lucide-react'
import { apiGet,apiPost } from '@/lib/api/client'
import { usePWAInstall } from '@/components/app/PWAInstallProvider'
import { pushConfigSchema,pushDeviceSchema,type PushConfig } from '@/lib/notifications/pushContracts'
import { supportsSurveyPush,pushWorkerReady,subscriptionHash,enableSurveyPush,disableSurveyPush,readySurveyWorker } from '@/lib/notifications/pushClient'

export function SurveyPushSettings() {
  const {ios,installed}=usePWAInstall()
  const [config,setConfig]=useState<PushConfig|null>(null),[ready,setReady]=useState(false)
  const [enabled,setEnabled]=useState(false),[supported,setSupported]=useState(false),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[permission,setPermission]=useState<NotificationPermission>('default')
  useEffect(()=>{
    let active=true
    const controller=new AbortController()
    const focus=()=>{if(supportsSurveyPush())setPermission(Notification.permission)}
    window.addEventListener('focus',focus)
    const load=async()=>{
      const support=supportsSurveyPush()
      setSupported(support)
      if(support)setPermission(Notification.permission)
      try {
        const value=await apiGet('/api/push/config',pushConfigSchema,{ttlMs:0,signal:controller.signal})
        if(!active)return
        setConfig(value)
        if(!support)return
        const registration=value.available?await readySurveyWorker():await navigator.serviceWorker.getRegistration('/')
        if(!registration||!active)return
        const capable=await pushWorkerReady(registration)
        if(!active)return
        setReady(capable)
        const subscription=await registration.pushManager.getSubscription()
        if(!subscription)return
        const status=await apiPost('/api/push/subscriptions/status',pushDeviceSchema,{endpoint_hash:await subscriptionHash(subscription)})
        if(active)setEnabled(status.enabled)
      } catch {if(active)setError('Phone reminder settings could not be loaded. Refresh this page to try again.')}
    }
    void load()
    return()=>{active=false;controller.abort();window.removeEventListener('focus',focus)}
  },[])
  const toggle=async()=>{
    if(busy)return
    setBusy(true);setError('')
    try {
      if(enabled){await disableSurveyPush();setEnabled(false)}
      else {
        if(!config?.publicKey)throw new Error('Phone reminders are not configured.')
        await enableSurveyPush(config.publicKey);setEnabled(true)
      }
      setPermission(Notification.permission)
    }catch(err){setError(err instanceof Error?err.message:'Could not change phone reminders.')}
    finally{setBusy(false)}
  }
  const installFirst=ios&&!installed
  const button=<button type="button" disabled={busy} onClick={toggle} className="btn btn-secondary mt-3 min-h-11 disabled:opacity-60">{busy?'Updating…':enabled?'Disable on this device':'Enable phone reminders'}</button>
  return <section aria-labelledby="survey-phone-reminders" className="card p-5">
    <div className="flex items-start gap-3"><BellRing aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]"/><div className="min-w-0 flex-1">
      <h2 id="survey-phone-reminders" className="text-base font-semibold">Phone reminders</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{enabled?(permission==='granted'?'Enabled for this account on this device.':'This device is registered, but notification permission is not active.'):'Enable this device to receive the project name and survey time when a job is scheduled or a reminder is due.'}</p>
      {enabled?button:installFirst?<p className="mt-3 text-sm"><Link href="/install" className="underline underline-offset-4 text-[var(--accent)]">Install METARDU on your Home Screen</Link>, open the installed app, then enable reminders here.</p>:
      !config?(!error&&<p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">Checking phone reminder availability…</p>):
      !config.available?<p className="mt-3 text-sm text-[var(--text-secondary)]">Phone delivery is not configured on this installation. Your scheduled jobs stay saved.</p>:
      !supported?<p className="mt-3 text-sm text-[var(--text-secondary)]">This browser does not support phone push. Use the installed app in a supported phone browser.</p>:
      !ready?<p className="mt-3 text-sm text-[var(--text-secondary)]">Save your work, then use “Reload when ready” to activate the app update before enabling reminders.</p>:
      permission==='denied'?<p className="mt-3 text-sm text-[var(--text-secondary)]">Notifications are blocked for METARDU on this device. Allow them in your browser or phone notification settings before enabling reminders.</p>:button}
      {config?.runner.lastError&&<p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">The reminder service needs attention. Jobs remain saved; phone delivery is not confirmed.</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-[var(--text-primary)]">{error}</p>}
    </div></div>
  </section>
}
