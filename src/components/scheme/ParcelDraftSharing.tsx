'use client'
import { useEffect, useRef, useState } from 'react'
import { ZodError } from 'zod'
import { Copy, Link2, ShieldOff } from 'lucide-react'
import ParcelDraftView from './ParcelDraftView'
import {
  parcelShareCommandSchema,
  parcelShareListSchema,
  parcelSharePreviewSchema,
  parcelShareReceiptSchema,
  type ParcelShareCommand,
  type ParcelShareReceipt,
} from '@/lib/scheme/parcelShareContract'
import {
  clearParcelSharePending,
  prepareParcelSharePending,
  readParcelSharePending,
} from '@/lib/scheme/parcelShareDevice'
import { readSchemeExportJson } from '@/lib/scheme/exportClient'
const button =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-40'
const unwrap = (value: unknown) =>
  value && typeof value === 'object' && 'data' in value ? value.data : null
const failureText = (failure: unknown, fallback: string) =>
  failure instanceof ZodError
    ? fallback
    : failure instanceof Error
      ? failure.message
      : fallback
export default function ParcelDraftSharing({
  projectId,
  viewerId,
  exportRequestId,
}: {
  projectId: string
  viewerId: string
  exportRequestId?: string
}) {
  const scope = `${viewerId}:${projectId}`,
    scopeRef = useRef(scope),
    mounted = useRef(true),
    controllers = useRef(new Set<AbortController>())
  scopeRef.current = scope
  const [preview, setPreview] = useState<ReturnType<
      typeof parcelSharePreviewSchema.parse
    > | null>(null),
    [history, setHistory] = useState<ReturnType<
      typeof parcelShareListSchema.parse
    > | null>(null),
    [previewError, setPreviewError] = useState(''),
    [historyError, setHistoryError] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [duration, setDuration] = useState<1 | 7 | 30>(7),
    [authority, setAuthority] = useState(false),
    [pending, setPending] = useState<ParcelShareCommand | null>(null),
    [receipt, setReceipt] = useState<ParcelShareReceipt | null>(null),
    [deviceReady, setDeviceReady] = useState(false),
    [busy, setBusy] = useState(false)
  const base = `/api/project/${projectId}/scheme/shares`
  useEffect(() => {
    mounted.current = true
    setPending(null)
    setReceipt(null)
    setDeviceReady(false)
    setError('')
    setMessage('')
    setPage(1)
    setBusy(false)
    const sync = () => {
      try {
        setPending(readParcelSharePending(viewerId, projectId))
        setDeviceReady(true)
      } catch (failure) {
        setDeviceReady(false)
        setError(
          failureText(failure, 'The retained sharing request cannot be read.'),
        )
      }
    }
    sync()
    window.addEventListener('storage', sync)
    const owned = controllers.current
    return () => {
      mounted.current = false
      window.removeEventListener('storage', sync)
      for (const controller of owned) controller.abort()
      owned.clear()
    }
  }, [scope, viewerId, projectId])
  useEffect(() => {
    let active = true
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    setHistory(null)
    setHistoryError('')
    void (async () => {
      try {
        const data = parcelShareListSchema.parse(
          unwrap(
            await readSchemeExportJson(
              await fetch(`${base}?page=${page}`, {
                cache: 'no-store',
                signal: controller.signal,
              }),
            ),
          ),
        )
        if (
          data.projectId !== projectId ||
          data.viewerId !== viewerId ||
          data.page !== page
        )
          throw new Error(
            'Sharing history does not match this account, project and page.',
          )
        if (active && !controller.signal.aborted) setHistory(data)
      } catch (failure) {
        if (active)
          setHistoryError(
            controller.signal.aborted
              ? 'Sharing history timed out. Reload the register.'
              : failureText(
                  failure,
                  'Sharing history failed its response checks. Reload the register.',
                ),
          )
      } finally {
        clearTimeout(timer)
      }
    })()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [scope, base, page, reload, projectId, viewerId])
  useEffect(() => {
    setPreview(null)
    setPreviewError('')
    setAuthority(false)
    if (!exportRequestId) return
    let active = true
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    void (async () => {
      try {
        const data = parcelSharePreviewSchema.parse(
          unwrap(
            await readSchemeExportJson(
              await fetch(
                `${base}?mode=preview&export_request_id=${encodeURIComponent(exportRequestId)}`,
                { cache: 'no-store', signal: controller.signal },
              ),
            ),
          ),
        )
        if (
          data.projectId !== projectId ||
          data.viewerId !== viewerId ||
          data.exportRequestId !== exportRequestId
        )
          throw new Error(
            'The sharing preview does not match this retained export.',
          )
        if (active && !controller.signal.aborted) setPreview(data)
      } catch (failure) {
        if (active)
          setPreviewError(
            controller.signal.aborted
              ? 'The sharing preview timed out. Reload to retry.'
              : failureText(
                  failure,
                  'The sharing preview failed its revision checks. Reload to retry.',
                ),
          )
      } finally {
        clearTimeout(timer)
      }
    })()
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [scope, base, exportRequestId, projectId, viewerId, reload])
  const validScope = () => mounted.current && scopeRef.current === scope
  async function post(value: unknown, action = '') {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    controllers.current.add(controller)
    try {
      return unwrap(
        await readSchemeExportJson(
          await fetch(`${base}${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value),
            signal: controller.signal,
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          }),
        ),
      )
    } finally {
      clearTimeout(timer)
      controllers.current.delete(controller)
    }
  }
  async function send(body: ParcelShareCommand) {
    const data = parcelShareReceiptSchema.parse(await post(body))
    if (
      data.id !== body.requestId ||
      data.projectId !== body.projectId ||
      data.viewerId !== body.expectedUserId ||
      data.exportRequestId !== body.exportRequestId ||
      data.snapshotHash !== body.snapshotHash ||
      Date.parse(data.expiresAt) - Date.parse(data.createdAt) !==
        body.durationDays * 86400000
    )
      throw new Error(
        'The server did not acknowledge this exact sharing request. The device key was retained.',
      )
    if (validScope()) {
      setReceipt(data)
      setReload((value) => value + 1)
    }
  }
  async function create() {
    if (!preview || !authority || busy || !deviceReady || pending) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32)),
        key = btoa(String.fromCharCode(...bytes))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replace(/=+$/, ''),
        body = parcelShareCommandSchema.parse({
          projectId,
          expectedUserId: viewerId,
          exportRequestId: preview.exportRequestId,
          requestId: crypto.randomUUID(),
          snapshotHash: preview.snapshotHash,
          durationDays: duration,
          authorityToShare: true,
          key,
        }),
        retained = await prepareParcelSharePending(body)
      if (!validScope()) return
      setPending(retained)
      setReceipt(null)
      await send(retained)
    } catch (failure) {
      if (validScope())
        setError(
          failureText(
            failure,
            'Link creation was not confirmed. Recover the retained request.',
          ),
        )
    } finally {
      if (validScope()) setBusy(false)
    }
  }
  async function recover() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      await send(pending)
    } catch (failure) {
      if (validScope())
        setError(
          failureText(
            failure,
            'Recovery was not confirmed. The request was retained.',
          ),
        )
    } finally {
      if (validScope()) setBusy(false)
    }
  }
  async function revoke(row: ParcelShareReceipt) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = parcelShareReceiptSchema.parse(
        await post({ shareId: row.id }, '?action=revoke'),
      )
      if (
        data.id !== row.id ||
        data.projectId !== projectId ||
        data.viewerId !== viewerId ||
        data.exportRequestId !== row.exportRequestId ||
        data.snapshotHash !== row.snapshotHash ||
        data.createdAt !== row.createdAt ||
        data.expiresAt !== row.expiresAt ||
        !data.revokedAt
      )
        throw new Error(
          'Revocation was not acknowledged exactly. Reload the register before relying on it.',
        )
      if (validScope()) {
        if (pending?.requestId === row.id) setReceipt(data)
        setReload((value) => value + 1)
        setMessage(
          'Link revoked. Previously saved recipient copies cannot be recalled.',
        )
      }
    } catch (failure) {
      if (validScope())
        setError(
          failureText(failure, 'Revocation is unconfirmed. Reload and retry.'),
        )
    } finally {
      if (validScope()) setBusy(false)
    }
  }
  const currentPreview =
      preview?.projectId === projectId &&
      preview.viewerId === viewerId &&
      preview.exportRequestId === exportRequestId
        ? preview
        : null,
    currentHistory =
      history?.projectId === projectId &&
      history.viewerId === viewerId &&
      history.page === page
        ? history
        : null,
    currentPending =
      pending?.projectId === projectId && pending.expectedUserId === viewerId
        ? pending
        : null,
    currentReceipt =
      receipt?.projectId === projectId &&
      receipt.viewerId === viewerId &&
      receipt.id === currentPending?.requestId
        ? receipt
        : null,
    link =
      currentPending &&
      currentReceipt &&
      !currentReceipt.revokedAt &&
      Date.parse(currentReceipt.expiresAt) > Date.now()
        ? `${window.location.origin}/p/${currentReceipt.id}#key=${currentPending.key}`
        : ''
  return (
    <section
      data-sentry-block="true"
      className="space-y-6 min-w-0"
      aria-label="Reviewed draft sharing"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold flex gap-3 items-center">
          <Link2 className="w-6 h-6 shrink-0" aria-hidden="true" />
          Share a retained draft
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Create an expiring review link to an exact retained geographic export.
          It shares parcel labels, 2D boundary vertices, grid areas and revision
          provenance. Client identities, surveyor profiles and raw observations
          are excluded.
        </p>
        <p className="text-sm">
          Anyone with the complete link can view and copy this draft until
          access expires or is revoked. Later project edits do not update the
          shared copy.
        </p>
        <a
          className="underline text-sm"
          href={`/project/${projectId}/scheme/exports`}
        >
          Return to retained exports
        </a>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--border-color)] p-3"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {currentPending && (
        <section
          className="rounded-xl border border-[var(--border-color)] p-4 space-y-3"
          aria-label="Retained sharing request"
        >
          <h2 className="font-semibold">Sharing key retained on this device</h2>
          <p className="text-sm break-all">
            Request {currentPending.requestId}. Retry this retained intent to
            complete or recover it. A committed link keeps its original expiry.
          </p>
          <button className={button} disabled={busy} onClick={recover}>
            Retry or recover link
          </button>
          {currentReceipt && (
            <>
              <p className="text-sm">
                {currentReceipt.revokedAt
                  ? 'This link is revoked.'
                  : `Access expires ${new Date(currentReceipt.expiresAt).toLocaleString()}.`}
              </p>
              {link && (
                <>
                  <label className="grid gap-2 text-sm">
                    Complete access link
                    <input
                      readOnly
                      value={link}
                      className="w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 font-mono text-xs"
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className={button}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link)
                          if (validScope()) setMessage('Complete link copied.')
                        } catch {
                          if (validScope())
                            setError(
                              'Clipboard access failed. Select and copy the complete link above.',
                            )
                        }
                      }}
                    >
                      <Copy className="w-4 h-4" aria-hidden="true" />
                      Copy access link
                    </button>
                    <a
                      className={button}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open shared draft
                    </a>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => revoke(currentReceipt)}
                    >
                      <ShieldOff className="w-4 h-4" aria-hidden="true" />
                      Revoke this link
                    </button>
                  </div>
                </>
              )}
              <button
                className={button}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const removed =
                      await clearParcelSharePending(currentPending)
                    if (!removed)
                      throw new Error(
                        'The device record changed. Recover it before clearing.',
                      )
                    if (validScope()) {
                      setPending(null)
                      setReceipt(null)
                      setMessage(
                        'Device key removed. Manage the grant in sharing history.',
                      )
                    }
                  } catch (failure) {
                    if (validScope())
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : 'The device key could not be removed.',
                      )
                  } finally {
                    if (validScope()) setBusy(false)
                  }
                }}
              >
                Remove key from this device
              </button>
              <p className="text-xs text-[var(--text-secondary)]">
                Removing the device key does not revoke the link. Copy it first
                if still needed; the server retains only its hash.
              </p>
            </>
          )}
        </section>
      )}
      {previewError && <p role="alert">{previewError}</p>}
      {exportRequestId && !currentPreview && !previewError && (
        <p role="status">
          Reading the exact retained draft for sharing review…
        </p>
      )}
      {currentPreview && (
        <section className="space-y-4 rounded-xl border border-[var(--border-color)] p-4">
          <h2 className="font-semibold">
            Review the disclosure · retained revision{' '}
            {currentPreview.snapshot.exportRevision}
          </h2>
          <ParcelDraftView
            key={currentPreview.snapshotHash}
            snapshot={currentPreview.snapshot}
          />
          <p className="text-sm">
            Unverified draft. This link does not establish field verification,
            ownership or professional approval.
          </p>
          <p className="font-mono break-all text-xs">
            Snapshot SHA-256: {currentPreview.snapshotHash}
          </p>
          <label className="grid gap-1 text-sm">
            Link duration
            <select
              value={duration}
              onChange={(event) =>
                setDuration(Number(event.target.value) as 1 | 7 | 30)
              }
              disabled={busy || !!currentPending}
              className="w-fit rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2"
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={authority}
              onChange={(event) => setAuthority(event.target.checked)}
              disabled={busy || !!currentPending}
              className="mt-1"
            />
            I have authority to share the displayed draft with anyone who
            receives the complete link.
          </label>
          <button
            className={button}
            disabled={!authority || !deviceReady || busy || !!currentPending}
            onClick={create}
          >
            Create expiring review link
          </button>
        </section>
      )}
      {!exportRequestId && (
        <p className="text-sm">
          Choose “Manage draft sharing” on a retained GeoJSON export to preview
          a new disclosure.
        </p>
      )}
      <section
        className="rounded-xl border border-[var(--border-color)] p-4 space-y-3"
        aria-label="Sharing history"
      >
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">Your sharing history</h2>
          <button
            className={button}
            disabled={busy}
            onClick={() => setReload((value) => value + 1)}
          >
            Reload sharing history
          </button>
        </div>
        {historyError && <p role="alert">{historyError}</p>}
        {!historyError && !currentHistory && (
          <p role="status">Loading sharing history…</p>
        )}
        {currentHistory && (
          <>
            <p className="text-sm">
              {currentHistory.total} retained sharing grants. Access keys are
              excluded from this register.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Sharing record</th>
                    <th className="p-2">Access</th>
                    <th className="p-2">Expires</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentHistory.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--border-color)]"
                    >
                      <td className="p-2 break-all font-mono text-xs">
                        {row.id}
                      </td>
                      <td className="p-2">
                        {row.revokedAt
                          ? 'Revoked'
                          : Date.parse(row.expiresAt) <= Date.now()
                            ? 'Expired'
                            : 'Active draft link'}
                      </td>
                      <td className="p-2">
                        {new Date(row.expiresAt).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <button
                          className={button}
                          disabled={busy || !!row.revokedAt}
                          onClick={() => revoke(row)}
                        >
                          Revoke link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!currentHistory.rows.length && (
              <p className="text-sm">
                {currentHistory.total === 0
                  ? 'No sharing grants for this account.'
                  : 'No grants on this page.'}
              </p>
            )}
            <nav
              className="flex flex-wrap justify-between gap-3 items-center text-sm"
              aria-label="Sharing history pages"
            >
              <span>
                Page {page} of{' '}
                {Math.max(1, Math.ceil(currentHistory.total / 24))}
              </span>
              <div className="flex gap-2">
                <button
                  className={button}
                  disabled={busy || page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous shares
                </button>
                <button
                  className={button}
                  disabled={busy || page * 24 >= currentHistory.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next shares
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
    </section>
  )
}
