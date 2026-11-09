'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import LogoUpload, { type LogoInfo } from '@/components/documents/LogoUpload'
import type { PlanId } from '@/lib/subscription/catalog'
import { useSubscription } from '@/lib/subscription/subscriptionContext'
import { useMapContext } from '../MapReactContext'

function SavedCompanyLogo({ plan }: { plan: PlanId }) {
  const [logo, setLogo] = useState<LogoInfo | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/documents/logo', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Company logo unavailable')
        const data = await response.json() as { logo: LogoInfo | null }
        if (!controller.signal.aborted) setLogo(data.logo ?? null)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    })()
    return () => controller.abort()
  }, [])

  if (failed) return <p role="status" className="text-xs text-[var(--text-secondary)]">Could not load the company logo. Close and reopen this section to retry.</p>
  if (logo === undefined) return <p role="status" className="text-xs text-[var(--text-secondary)]">Loading company logo…</p>
  return <LogoUpload plan={plan} existingLogo={logo} />
}

export function MapCaptureBranding() {
  const { plan, loading } = useSubscription()
  const { data: session } = useSession()
  const { preferCompanyLogo, setPreferCompanyLogo } = useMapContext()
  const [open, setOpen] = useState(false)
  if (loading || plan === 'free' || !session?.user?.id) {
    return <p className="px-1 text-xs text-[var(--text-secondary)]">Captures use the METARDU logo.</p>
  }
  return (
    <div className="space-y-2 px-1 text-xs text-[var(--text-secondary)]">
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={preferCompanyLogo} onChange={event => setPreferCompanyLogo(event.currentTarget.checked)} />
        Use my company logo when available
      </label>
      <p>METARDU is used if you leave this off or have no company logo.</p>
      <details onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer py-2 font-medium">Manage company logo</summary>
        {open && <SavedCompanyLogo key={session.user.id} plan={plan} />}
      </details>
    </div>
  )
}
