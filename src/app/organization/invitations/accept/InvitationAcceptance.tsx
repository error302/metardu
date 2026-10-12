'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const TOKEN_STORAGE_KEY = 'metardu-firm-invitation-token'

export default function InvitationAcceptance() {
  const { status } = useSession()
  const router = useRouter()
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('Preparing invitation…')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const fromFragment = new URLSearchParams(window.location.hash.slice(1)).get('token')
    const stored = fromFragment || window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
    if (fromFragment) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fromFragment)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
    setToken(stored)
    if (!stored) setMessage('This link does not contain an invitation. Ask the firm administrator to send a new one.')
  }, [])

  useEffect(() => {
    if (status !== 'authenticated' || !token || started.current) return
    started.current = true
    setMessage('Checking the invitation and your account email…')
    setFailed(false)
    fetch('/api/organization-invitations/accept', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => ({})) as unknown
        const error = data && typeof data === 'object' && 'error' in data
          ? (data as { error?: unknown }).error
          : undefined
        if (!response.ok) throw new Error(typeof error === 'string' ? error : 'Could not accept this invitation.')
        const organizationId = data && typeof data === 'object' && 'organizationId' in data
          ? (data as { organizationId?: unknown }).organizationId
          : undefined
        if (typeof organizationId !== 'string') throw new Error('The invitation response was incomplete. Contact firm support.')
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
        setMessage('Invitation accepted. Opening your firm workspace…')
        router.replace(`/organization?id=${encodeURIComponent(organizationId)}`)
      })
      .catch((cause: unknown) => {
        setFailed(true)
        setMessage(cause instanceof Error ? cause.message : 'Could not accept this invitation.')
        started.current = false
      })
  }, [attempt, router, status, token])

  async function continueToSignIn() {
    if (!token) return
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    await signIn(undefined, { callbackUrl: `${window.location.origin}${window.location.pathname}` })
  }

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 shadow-xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">METARDU · Firm access</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">Accept your invitation</h1>
        <p role={failed ? 'alert' : 'status'} className={`mt-3 text-sm leading-6 ${failed ? 'text-red-600 dark:text-red-300' : 'text-[var(--text-secondary)]'}`}>{message}</p>
        {status === 'unauthenticated' && token ? <button type="button" onClick={() => void continueToSignIn()} className="mt-6 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black">Sign in to continue</button> : null}
        {status === 'authenticated' && failed ? <button type="button" onClick={() => { started.current = false; setFailed(false); setMessage('Retrying invitation…'); setAttempt((value) => value + 1) }} className="mt-6 inline-flex rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">Retry</button> : null}
        <p className="mt-6 text-xs leading-5 text-[var(--text-muted)]">You must sign in with the verified email address the firm invited. Invitation links are single-use and expire after seven days.</p>
        <Link href="/" className="mt-5 inline-block text-xs font-medium text-[var(--accent)]">Return to METARDU</Link>
      </section>
    </main>
  )
}
