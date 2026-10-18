'use client'

import { useEffect, useRef, useState } from 'react'
import { reloadCurrentDocument } from '@/lib/app/documentRecovery'
import { requestServiceWorkerActivation, watchServiceWorkerUpdates } from '@/lib/app/serviceWorkerUpdates'

export function AppUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const stop = watchServiceWorkerUpdates(navigator.serviceWorker, worker => {
      setWaitingWorker(worker)
      setDismissed(false)
      setFailure(null)
    })
    return () => { stop(); pending.current?.abort() }
  }, [])

  const update = async () => {
    if (!waitingWorker || pending.current || !('serviceWorker' in navigator)) return
    const controller = new AbortController()
    pending.current = controller
    setUpdating(true)
    setFailure(null)
    try {
      await requestServiceWorkerActivation(navigator.serviceWorker, waitingWorker, { signal: controller.signal })
      if (!controller.signal.aborted) reloadCurrentDocument()
    } catch (error) {
      if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Update unavailable. Your page has not reloaded.')
    } finally {
      if (!controller.signal.aborted) setUpdating(false)
      pending.current = null
    }
  }

  if (!waitingWorker || dismissed) return null
  return (
    <div role="status" className="fixed top-0 left-0 right-0 z-[210] bg-[var(--accent)] text-black text-center text-sm font-semibold py-2.5 px-4 flex flex-wrap items-center justify-center gap-3">
      <span>A new version is ready. Save your work in all open METARDU tabs before reloading.</span>
      <button onClick={update} disabled={updating} className="bg-black text-[var(--accent)] px-3 py-2 rounded font-semibold text-sm disabled:opacity-60">
        {updating ? 'Preparing update…' : 'Reload when ready'}
      </button>
      <button onClick={() => setDismissed(true)} disabled={updating} className="rounded px-3 py-2 underline disabled:opacity-60" aria-label="Dismiss update banner">Later</button>
      {failure && <p role="alert" className="basis-full">{failure}</p>}
    </div>
  )
}
