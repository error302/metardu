'use client'

import { useState } from 'react'
import { MailCheck } from 'lucide-react'

export default function EmailVerificationNotice({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const sendVerification = async () => {
    setSending(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/email-verification/send', { method: 'POST' })
      const data = await response.json().catch(() => ({})) as { error?: string; sent?: boolean; verified?: boolean }
      if (!response.ok) throw new Error(data.error || 'Could not send the verification email.')
      setSent(data.sent === true)
      setMessage(data.verified ? 'This email address is already verified.' : 'Check your inbox for a METARDU verification link.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the verification email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] p-2 text-[var(--accent)]"><MailCheck className="h-4 w-4" /></span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Confirm your METARDU email</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">We’ll send a secure link to {email}. You can keep using your account while you verify it.</p>
          {message && <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">{message}</p>}
        </div>
      </div>
      <button type="button" onClick={sendVerification} disabled={sending || sent} className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
        {sending ? 'Sending…' : sent ? 'Email sent' : 'Send verification link'}
      </button>
    </section>
  )
}
