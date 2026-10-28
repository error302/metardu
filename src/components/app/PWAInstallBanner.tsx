'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, X } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { usePWAInstall } from './PWAInstallProvider'

const DISMISS_KEY = 'metardu_pwa_install_dismissed_at'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000
function recentlyDismissed() {
  try {
    const timestamp = Number(localStorage.getItem(DISMISS_KEY))
    return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp >= 0 && Date.now() - timestamp < DISMISS_TTL_MS
  } catch { return false }
}

/** In-flow only: one shared prompt, no modal over active survey controls. */
export function PWAInstallBanner({ manual = false }: { manual?: boolean }) {
  const { t, hydrated } = useLanguage()
  const { available, accepted, installed, busy, ios, error, install } = usePWAInstall()
  const [dismissed, setDismissed] = useState(false)
  const [iosReady, setIosReady] = useState(false)
  useEffect(() => { setDismissed(recentlyDismissed()) }, [])
  useEffect(() => {
    if (!ios || manual) return
    const timer = setTimeout(() => setIosReady(true), 4000)
    return () => clearTimeout(timer)
  }, [ios, manual])
  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* Storage may be unavailable. */ }
  }
  if (!hydrated || (!manual && (installed || dismissed || (!available && !iosReady && !error && !busy)))) return null
  return (
    <section aria-label="Install METARDU" className="relative mx-auto my-3 w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start gap-3">
        <Download aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{installed ? 'METARDU is installed' : accepted ? 'Finish installing METARDU' : t('pwa.installTitle')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{installed ? 'Open METARDU from your Home Screen or app launcher.' : accepted ? 'Installation was requested. Finish the browser’s steps, then look for METARDU on your Home Screen or app launcher.' : 'Add METARDU to your Home Screen for a dedicated app window and quick access to your survey workspace.'}</p>
          {!installed && <div className="mt-3 flex flex-wrap items-center gap-2">
            {(available || busy) && <button type="button" disabled={busy} onClick={async () => {
              const outcome = await install()
              if (outcome === 'dismissed' && !manual) dismiss()
            }} className="btn btn-primary min-h-11 disabled:opacity-60">{busy ? 'Opening installer…' : t('pwa.installNow')}</button>}
            {!manual && <Link href="/install" className="btn btn-secondary min-h-11">Installation guide</Link>}
            {!manual && <button type="button" onClick={dismiss} className="min-h-11 rounded-lg px-3 text-sm text-[var(--text-secondary)] underline">{t('pwa.notNow')}</button>}
          </div>}
          {manual && !installed && !accepted && !available && !busy && <p className="mt-3 text-sm text-[var(--text-secondary)]">Use the steps below if your browser does not show an install button. Browser support and install menus vary by device.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-[var(--text-primary)]">{error}</p>}
        </div>
        {!manual && <button type="button" onClick={dismiss} aria-label="Close install banner" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[var(--bg-tertiary)]"><X aria-hidden="true" className="h-4 w-4" /></button>}
      </div>
    </section>
  )
}
