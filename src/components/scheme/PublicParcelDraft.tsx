'use client'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FileCheck2, Link2Off } from 'lucide-react'
import ParcelDraftView from '@/components/scheme/ParcelDraftView'
import {
  parcelShareKey,
  publicParcelShareSchema,
} from '@/lib/scheme/parcelShareContract'
import { readSchemeExportJson } from '@/lib/scheme/exportClient'
type Shared = ReturnType<typeof publicParcelShareSchema.parse>
export default function PublicParcelDraft() {
  const { id } = useParams<{ id: string }>(),
    [attempt, setAttempt] = useState(0),
    [fragment, setFragment] = useState(''),
    [record, setRecord] = useState<{ data: Shared; scope: string } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const change = () => setFragment(window.location.hash)
    change()
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [id])
  useEffect(() => {
    let active = true
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    setRecord(null)
    setError('')
    setLoading(true)
    void (async () => {
      try {
        const query = new URLSearchParams(fragment.replace(/^#/, '')),
          key = parcelShareKey.safeParse(query.get('key'))
        if (
          !key.success ||
          query.getAll('key').length !== 1 ||
          [...query.keys()].some((name) => name !== 'key')
        )
          throw new Error(
            'Ask the surveyor for a current, complete sharing link.',
          )
        const reply = await fetch(
            `/api/public/parcel/${encodeURIComponent(id)}`,
            {
              headers: { Authorization: `Bearer ${key.data}` },
              credentials: 'omit',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              signal: controller.signal,
            },
          ),
          body = await readSchemeExportJson(reply),
          parsed = publicParcelShareSchema.safeParse(
            body && typeof body === 'object' && 'data' in body
              ? body.data
              : null,
          )
        if (
          !parsed.success ||
          parsed.data.id !== id ||
          Date.parse(parsed.data.expiresAt) <= Date.now()
        )
          throw new Error(
            'This shared draft failed its identity or expiry checks. Ask for a current link.',
          )
        if (active && !controller.signal.aborted)
          setRecord({ data: parsed.data, scope: `${id}:${fragment}` })
      } catch (failure) {
        if (active)
          setError(
            controller.signal.aborted
              ? 'The shared draft request timed out. Retry the read.'
              : failure instanceof Error
                ? failure.message
                : 'The shared draft is unavailable.',
          )
      } finally {
        clearTimeout(timer)
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [id, fragment, attempt])
  // Identity checks hide the previous payload before effect cleanup on navigation.
  const current = record?.scope === `${id}:${fragment}` ? record.data : null
  useEffect(() => {
    if (!current) return
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timer)
      const remaining = Date.parse(current.expiresAt) - Date.now()
      if (remaining <= 0) {
        setRecord(null)
        setError(
          'This sharing link has expired. Ask the surveyor for a current link.',
        )
      } else timer = setTimeout(check, Math.min(remaining, 3600000))
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [current])
  return (
    <main
      id="main-content"
      data-sentry-block="true"
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] px-4 py-8 sm:px-6"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start gap-3 border-b border-[var(--border-color)] pb-5">
          <FileCheck2
            className="w-7 h-7 shrink-0 text-[var(--accent)]"
            aria-hidden="true"
          />
          <div>
            <p className="text-xs tracking-widest uppercase text-[var(--text-secondary)]">
              METARDU · shared review copy
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              {current
                ? 'Draft parcel boundaries'
                : loading
                  ? 'Loading shared draft'
                  : 'Shared draft unavailable'}
            </h1>
          </div>
        </header>
        {loading && <p role="status">Checking the sharing link…</p>}
        {error && (
          <section className="space-y-3 rounded-xl border border-[var(--border-color)] p-5">
            <p role="alert" className="flex gap-2">
              <Link2Off className="w-5 h-5 shrink-0" aria-hidden="true" />
              {error}
            </p>
            <button
              className="rounded-lg border border-[var(--border-color)] px-4 py-2"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry shared draft
            </button>
          </section>
        )}
        {current && (
          <>
            <section className="rounded-xl border border-[var(--border-color)] p-5 space-y-2">
              <h2 className="font-semibold">
                Unverified draft · retained revision{' '}
                {current.snapshot.exportRevision}
              </h2>
              <p className="text-sm">
                This is a shared review copy, not field verification or an
                issued survey plan. A listed vertex does not confirm a found or
                fixed survey beacon.
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                The link shows the saved revision. Later project changes do not
                update it. Access expires{' '}
                {new Date(current.expiresAt).toLocaleString()} and may be
                revoked earlier. Revocation cannot recall copies already saved
                by a recipient.
              </p>
            </section>
            <ParcelDraftView
              key={current.snapshotHash}
              snapshot={current.snapshot}
            />
            <details className="rounded-xl border border-[var(--border-color)] p-4 text-sm">
              <summary className="cursor-pointer font-medium">
                Retained revision provenance
              </summary>
              <dl className="mt-4 grid gap-3">
                <div>
                  <dt>Source project grid</dt>
                  <dd>{current.snapshot.sourceCrs}</dd>
                </div>
                <div>
                  <dt>Source revision</dt>
                  <dd className="font-mono break-all">
                    {current.snapshot.sourceRevision}
                  </dd>
                </div>
                <div>
                  <dt>Source SHA-256</dt>
                  <dd className="font-mono break-all">
                    {current.snapshot.sourceHash}
                  </dd>
                </div>
                <div>
                  <dt>Retained geographic file SHA-256</dt>
                  <dd className="font-mono break-all">
                    {current.snapshot.artifactHash}
                  </dd>
                </div>
                <div>
                  <dt>Shared snapshot SHA-256</dt>
                  <dd className="font-mono break-all">
                    {current.snapshotHash}
                  </dd>
                </div>
              </dl>
            </details>
          </>
        )}
      </div>
    </main>
  )
}
