'use client'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function FieldbookInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Don't show if already installed (standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) { setInstalled(true); return }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    // Background-sync registration for fieldbook queue (IndexedDB metardu-offline)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        const registration = reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
        if (registration.sync) registration.sync.register('fieldbook-sync').catch(() => {})
      }).catch(() => {})
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || dismissed || !deferred) return null

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] md:hidden">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Install METARDU Access</p>
        <p className="text-[11px] text-[var(--text-muted)]">Keep METARDU close. Check saved status and export a backup before leaving site.</p>
      </div>
      <button
        onClick={async () => { await deferred.prompt(); const c = await deferred.userChoice; if (c.outcome === 'accepted') setDeferred(null) }}
        className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold shrink-0"
      >
        Install
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="p-1 text-[var(--text-muted)]">×</button>
    </div>
  )
}
