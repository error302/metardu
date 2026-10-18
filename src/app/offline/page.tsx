'use client';
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  const mounted = useRef(false)

  const handleRetry = useCallback(async () => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const timeout = setTimeout(() => controller.abort(), 10000)
    setRetrying(true)
    setStatus(null)
    try {
      const res = await fetch('/api/public/health', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal })
      const health: unknown = await res.json()
      const healthy = res.ok && typeof health === 'object' && health !== null && 'status' in health && health.status === 'healthy'
      if (mounted.current && pending.current === controller) setStatus(healthy ? 'Connection restored. You can return to your working tab or open the dashboard when ready.' : 'METARDU is not ready yet. Keep your working tab open and try again later.')
    } catch {
      if (mounted.current && pending.current === controller) setStatus('Could not reach METARDU. Check your connection and try again; keep your working tab open.')
    } finally {
      clearTimeout(timeout)
      if (pending.current === controller) {
        pending.current = null
        if (mounted.current) setRetrying(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const onOnline = () => { void handleRetry() }
    window.addEventListener('online', onOnline)
    return () => { mounted.current = false; pending.current?.abort(); pending.current = null; window.removeEventListener('online', onOnline) }
  }, [handleRetry])

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Connection help</h1>
        <p className="text-[var(--text-secondary)] mb-2">
          Keep your working tab open. Save a device copy of your work before reloading or leaving it.
        </p>
        <p className="text-[var(--text-muted)] text-sm mb-8">
          A restored connection does not confirm that observations reached the server. Check the delivery status in your field book.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn btn-primary disabled:opacity-60"
          >
            {retrying ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Checking…</>
            ) : 'Check connection'}
          </button>
          <Link href="/dashboard" prefetch={false} className="btn btn-secondary">
            Open dashboard
          </Link>
        </div>
        {status && <p role="status" className="text-sm text-[var(--text-secondary)] mb-6">{status}</p>}

        <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-lg px-4 py-3 border border-[var(--border-color)]">
          Pages and projects may need a connection to open. Keep essential tools open and export the information you need before going into the field.
        </div>
      </div>
    </div>
  )
}
