'use client'

import { useState } from 'react'

export function ConsentDecisionForm({ serializedRequest }: { serializedRequest: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: 'allow' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/chatgpt/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serializedRequest, decision }),
      })
      const result = (await response.json()) as { redirectUrl?: string; error?: string }
      if (!response.ok || !result.redirectUrl) {
        setError(result.error ?? 'Could not complete the connection decision. Restart the connection from ChatGPT.')
        return
      }
      window.location.assign(result.redirectUrl)
    } catch {
      setError('Could not reach METARDU. Restart the connection when your network is available.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 flex flex-wrap gap-4">
      <button type="button" onClick={() => void decide('allow')} disabled={busy} className="rounded bg-[var(--accent)] px-5 py-3 font-semibold text-black disabled:opacity-50">
        {busy ? 'Working…' : 'Allow requested access'}
      </button>
      <button type="button" onClick={() => void decide('deny')} disabled={busy} className="rounded border border-[var(--border-color)] px-5 py-3 disabled:opacity-50">
        Cancel
      </button>
      {error && <p role="status" className="w-full text-sm text-amber-300">{error}</p>}
    </div>
  )
}
