'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react'
import { authFetch } from '@/lib/auth/client'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'checking' | 'verified' | 'error'>('checking')
  const [message, setMessage] = useState('Confirming your METARDU email address…')

  useEffect(() => {
    let active = true
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token. Request a fresh email from your dashboard.')
      return () => { active = false }
    }

    void authFetch('/api/auth/email-verification/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!active) return
      if (!response.ok) {
        setStatus('error')
        setMessage(data.error || 'We could not verify this email address.')
        return
      }
      setStatus('verified')
      setMessage('Your email is verified. Your METARDU account is ready.')
    }).catch(() => {
      if (!active) return
      setStatus('error')
      setMessage('We could not reach METARDU. Please try again from your dashboard.')
    })

    return () => { active = false }
  }, [token])

  const Icon = status === 'checking' ? LoaderCircle : status === 'verified' ? CheckCircle2 : TriangleAlert

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-5 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center shadow-2xl sm:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]">
          <Icon className={`h-6 w-6 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">METARDU account</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{status === 'verified' ? 'Email confirmed' : status === 'error' ? 'Verification needs attention' : 'Verifying your email'}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className="rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110">Continue to METARDU</Link>
          {status === 'error' && <Link href="/login" className="rounded-lg border border-[var(--border-color)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]">Sign in</Link>}
        </div>
      </section>
    </main>
  )
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[var(--bg-primary)]" />}><VerifyEmailContent /></Suspense>
}
