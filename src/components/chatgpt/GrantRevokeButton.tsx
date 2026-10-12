'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GrantRevokeButton({ grantId }: { grantId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function revoke() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/chatgpt/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' })
      if (!response.ok) {
        setError(response.status === 404 ? 'Connection is already revoked or unavailable.' : 'Could not revoke access. Try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach METARDU. Try again when your connection is available.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={() => void revoke()} disabled={busy} className="rounded border border-[var(--border-color)] px-4 py-2 disabled:opacity-50">
        {busy ? 'Revoking…' : 'Revoke access'}
      </button>
      {error && <p role="status" className="max-w-64 text-right text-xs text-amber-300">{error}</p>}
    </div>
  )
}
