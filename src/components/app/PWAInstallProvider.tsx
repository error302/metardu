'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'failed'
interface InstallState {
  available: boolean
  accepted: boolean
  installed: boolean
  busy: boolean
  ios: boolean
  error: string | null
  install(): Promise<InstallOutcome>
}
const InstallContext = createContext<InstallState | null>(null)

function standalone() {
  return navigator.standalone === true || ['standalone', 'fullscreen', 'window-controls-overlay', 'minimal-ui']
    .some(mode => window.matchMedia(`(display-mode: ${mode})`).matches)
}

/** One prompt owner for the whole app; native events are single-use. */
export function PWAInstallProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ios, setIos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deferred = useRef<InstallPromptEvent | null>(null)
  const pending = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    setInstalled(standalone())
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
    const onPrompt = (event: Event) => {
      if (standalone() || window.location.pathname.startsWith('/p/')) return
      event.preventDefault()
      deferred.current = event as InstallPromptEvent
      setAvailable(true)
      setAccepted(false)
      setError(null)
    }
    const onInstalled = () => {
      deferred.current = null
      setAvailable(false)
      setInstalled(true)
      setAccepted(false)
      setError(null)
    }
    const display = window.matchMedia('(display-mode: standalone)')
    const onDisplay = () => { if (standalone()) onInstalled() }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    display.addEventListener?.('change', onDisplay)
    return () => {
      mounted.current = false
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      display.removeEventListener?.('change', onDisplay)
    }
  }, [])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (pending.current || !deferred.current) return 'unavailable'
    const prompt = deferred.current
    deferred.current = null
    pending.current = true
    setAvailable(false)
    setBusy(true)
    setError(null)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (mounted.current && choice.outcome === 'accepted') setAccepted(true)
      return choice.outcome
    } catch {
      if (mounted.current) setError('The install prompt could not open. Use your browser menu to install, or try again after reopening this page.')
      return 'failed'
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])

  return <InstallContext.Provider value={{ available, accepted, installed, busy, ios, error, install }}>{children}</InstallContext.Provider>
}

export function usePWAInstall() {
  const state = useContext(InstallContext)
  if (!state) throw new Error('PWAInstallProvider is required')
  return state
}
