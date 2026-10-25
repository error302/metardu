'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { Download, RefreshCw } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import SchemeExportHistory from './SchemeExportHistory'
import {
  schemeExportAccessSchema,
  schemeExportIds,
  schemeExportPreviewSchema,
  schemeExportRequestSchema,
  type SchemeExportPreview,
  type SchemeExportFormat,
} from '@/lib/scheme/exportContract'
import {
  readSchemeExportJson,
  readSchemeExportReply,
} from '@/lib/scheme/exportClient'
import {
  prepareSchemePending,
  readSchemePending,
  acknowledgeSchemePending,
  type PendingSchemeExport,
} from '@/lib/scheme/exportPending'
const action =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-40'
export default function SchemeExportReview({
  projectId,
  parcelIds,
}: {
  projectId: string
  parcelIds: string[]
}) {
  const formId = useId(),
    [preview, setPreview] = useState<SchemeExportPreview | null>(null),
    [viewer, setViewer] = useState(''),
    [storageReady, setStorageReady] = useState(false)
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deviceError, setDeviceError] = useState(''),
    [message, setMessage] = useState(''),
    [attempt, setAttempt] = useState(0)
  const [format, setFormat] = useState<SchemeExportFormat>('dxf'),
    [reviewed, setReviewed] = useState(false),
    [pending, setPending] = useState<PendingSchemeExport | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const generation = useRef(0),
    operation = useRef<AbortController | null>(null),
    alive = useRef(false)
  const selectionKey = parcelIds.join(',')
  useEffect(() => {
    alive.current = true
    const token = ++generation.current,
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    operation.current?.abort()
    operation.current = null
    setLoading(true)
    setBusy(false)
    setError('')
    setDeviceError('')
    setMessage('')
    setReviewed(false)
    setPreview(null)
    setViewer('')
    setPending(null)
    setStorageReady(false)
    const valid = () =>
      alive.current &&
      generation.current === token &&
      !controller.signal.aborted
    void (async () => {
      try {
        const access = schemeExportAccessSchema.parse(
          z.object({ data: schemeExportAccessSchema }).parse(
            await readSchemeExportJson(
              await fetch(`/api/project/${projectId}/scheme/exports`, {
                cache: 'no-store',
                signal: controller.signal,
              }),
            ),
          ).data,
        )
        if (access.projectId !== projectId)
          throw new Error('The export register belongs to another project.')
        if (!valid()) return
        setViewer(access.viewerId)
        setStorageReady(access.storageReady)
        try {
          setPending(readSchemePending(access.viewerId, projectId))
        } catch (failure) {
          setDeviceError(
            failure instanceof Error
              ? failure.message
              : 'The device recovery record could not be read.',
          )
        }
        if (!selectionKey) return
        const ids = schemeExportIds.parse(selectionKey.split(',')),
          query = new URLSearchParams()
        ids.forEach((id) => query.append('parcel_id', id))
        const value = z.object({ data: schemeExportPreviewSchema }).parse(
          await readSchemeExportJson(
            await fetch(`/api/project/${projectId}/scheme/exports?${query}`, {
              cache: 'no-store',
              signal: controller.signal,
            }),
          ),
        ).data
        if (
          value.viewerId !== access.viewerId ||
          value.source.projectId !== projectId ||
          JSON.stringify(value.source.selection) !== JSON.stringify(ids) ||
          value.source.mode !== 'polygons' ||
          value.source.partial ||
          value.source.features.some(
            (feature) =>
              feature.properties.kind !== 'parcel' ||
              feature.properties.evidenceState !== 'reviewed_draft',
          )
        )
          throw new Error(
            'The export preview does not match the exact reviewed parcel selection.',
          )
        if (valid()) setPreview(value)
      } catch (failure) {
        if (failure instanceof z.ZodError)
          failure = new Error(
            'The server reply failed its project or source checks. Reload review to retry.',
          )
        if (alive.current && generation.current === token)
          setError(
            controller.signal.aborted
              ? 'Loading export review timed out. Reload to retry.'
              : failure instanceof Error
                ? failure.message
                : 'The export review is unavailable.',
          )
      } finally {
        clearTimeout(timer)
        if (alive.current && generation.current === token) setLoading(false)
      }
    })()
    return () => {
      alive.current = false
      clearTimeout(timer)
      controller.abort()
      operation.current?.abort()
    }
  }, [projectId, selectionKey, attempt])
  async function run(kind: 'new' | 'recover' | 'retry' | 'cancel') {
    if (operation.current || !viewer || deviceError) return
    const controller = new AbortController(),
      token = generation.current
    operation.current = controller
    const valid = () =>
      alive.current &&
      generation.current === token &&
      operation.current === controller &&
      !controller.signal.aborted
    const timer = setTimeout(() => controller.abort(), 30000)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let command = pending
      if (kind === 'new') {
        if (!preview || !reviewed || !preview.source.selection)
          throw new Error(
            'Review the exact selected boundary drafts before generating an export.',
          )
        command = await prepareSchemePending(
          schemeExportRequestSchema.parse({
            projectId,
            expectedUserId: viewer,
            requestId: crypto.randomUUID(),
            parcelIds: preview.source.selection,
            sourceHash: preview.sourceHash,
            reviewed: true,
          }),
          format,
        )
        if (valid()) setPending(command)
      }
      if (!command)
        throw new Error('There is no retained export request to recover.')
      if (
        command.body.expectedUserId !== viewer ||
        command.body.projectId !== projectId
      )
        throw new Error(
          'The retained request belongs to another account or project.',
        )
      if (!valid()) return
      const recovery = new URLSearchParams({
          project_id: projectId,
          request_id: command.body.requestId,
        }),
        url = `/api/scheme/export/${command.format}`
      const response = await fetch(
        kind === 'recover'
          ? `${url}?${recovery}`
          : kind === 'cancel'
            ? `${url}?action=cancel`
            : url,
        kind === 'recover'
          ? { cache: 'no-store', signal: controller.signal }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(command.body),
              cache: 'no-store',
              signal: controller.signal,
            },
      )
      const reply = await readSchemeExportReply(response, command)
      if (!valid()) return
      if (reply.outcome === 'committed') {
        const blob = new Blob([new Uint8Array(reply.bytes)], {
            type:
              command.format === 'dxf'
                ? 'application/dxf'
                : 'application/geo+json',
          }),
          href = URL.createObjectURL(blob),
          anchor = document.createElement('a')
        try {
          anchor.href = href
          anchor.download = reply.filename
          document.body.appendChild(anchor)
          anchor.click()
        } finally {
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(href), 1000)
        }
        setMessage(
          `Registered draft revision ${reply.revision}; download initiated. ${reply.sourceCrs} source → ${reply.outputCrs} output. Content SHA-256: ${reply.contentHash}`,
        )
      } else
        setMessage(
          'The request is durably cancelled. Delayed retries cannot generate an output with this request ID.',
        )
      setHistoryVersion((value) => value + 1)
      const cleared = await acknowledgeSchemePending(command)
      if (!cleared)
        throw new Error(
          'The server outcome is confirmed, but this device recovery record changed. Reload before another export.',
        )
      if (valid()) {
        setPending(readSchemePending(viewer, projectId))
        setReviewed(false)
      }
    } catch (failure) {
      if (failure instanceof z.ZodError)
        failure = new Error(
          'The server reply failed its artifact checks. The retained request was preserved.',
        )
      if (alive.current && generation.current === token)
        setError(
          controller.signal.aborted
            ? 'The export response timed out. The request is retained; recover its result before starting another.'
            : failure instanceof Error
              ? failure.message
              : 'Export failed. The retained request was preserved.',
        )
    } finally {
      clearTimeout(timer)
      if (operation.current === controller) {
        operation.current = null
        if (alive.current && generation.current === token) setBusy(false)
      }
    }
  }
  return (
    <section
      className="mx-auto w-full min-w-0 max-w-6xl space-y-4 px-4 py-6"
      aria-label="Reviewed parcel export workspace"
    >
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          className="underline underline-offset-4"
          href={`/project/${projectId}/scheme`}
        >
          Scheme overview
        </Link>
        <Link
          className="underline underline-offset-4"
          href={`/project/${projectId}/scheme/blocks`}
        >
          Select parcels in the register
        </Link>
        <Link
          className="underline underline-offset-4"
          href={`/project/${projectId}/deliver`}
        >
          Registered outputs
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GeomaticsIcon symbol="parcel" className="h-6 w-6" />
            Export reviewed boundaries
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Export up to 50 explicitly selected saved boundary drafts per batch.
            Each output retains its source snapshot and a registered,
            recoverable file.
          </p>
        </div>
        <button
          type="button"
          className={action}
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload review
        </button>
      </header>
      {loading && (
        <p role="status">
          Loading the export register and selected boundaries…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-red-500/30 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {deviceError && (
        <p
          role="alert"
          className="break-words rounded-lg border border-red-500/30 p-3 text-sm"
        >
          {deviceError} Device recovery must be available before sending another
          export.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="break-words rounded-lg border border-[var(--border-color)] p-3 text-sm"
        >
          {message}
        </p>
      )}
      {!loading && !storageReady && viewer && (
        <p className="rounded-lg border border-[var(--border-color)] p-3 text-sm">
          Retained export storage is unavailable. No new export can be
          generated.
        </p>
      )}
      {pending && (
        <section
          className="space-y-3 rounded-xl border border-[var(--border-color)] p-4"
          aria-label="Retained export request"
        >
          <h2 className="font-semibold">Resolve the retained export</h2>
          <p className="text-sm">
            {pending.body.parcelIds.length} selected parcels ·{' '}
            {pending.format.toUpperCase()} · this request may refer to an
            earlier selection.
          </p>
          <p className="break-all font-mono text-xs">
            Request: {pending.body.requestId}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Recovery returns the original registered bytes. Cancellation returns
            an already committed file or permanently cancels this request ID
            before a new output is generated.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={action}
              disabled={busy || !!deviceError}
              onClick={() => void run('recover')}
            >
              Recover registered result
            </button>
            <button
              className={action}
              disabled={busy || !!deviceError}
              onClick={() => void run('retry')}
            >
              Retry same request
            </button>
            <button
              className={action}
              disabled={busy || !!deviceError}
              onClick={() => void run('cancel')}
            >
              Cancel unconfirmed request
            </button>
          </div>
        </section>
      )}
      {!selectionKey && !loading && (
        <p className="rounded-lg border border-[var(--border-color)] p-4 text-sm">
          Select parcels in a block register to begin a new export review. A
          retained request can be recovered above even when its source has since
          changed.
        </p>
      )}
      {preview && (
        <section
          className="space-y-4 rounded-xl border border-[var(--border-color)] p-4"
          aria-label="Selected boundary review"
        >
          <div>
            <h2 className="font-semibold">{preview.source.projectName}</h2>
            <p className="text-sm">
              {preview.source.features.length} reviewed draft boundaries ·{' '}
              {preview.source.crs} · project-grid metres
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Parcel</th>
                  <th className="p-2">Block</th>
                  <th className="p-2">Saved revision</th>
                  <th className="p-2">Grid area (m²)</th>
                </tr>
              </thead>
              <tbody>
                {preview.source.features.map((feature) =>
                  feature.properties.kind === 'parcel' && 'id' in feature ? (
                    <tr
                      key={feature.id}
                      className="border-t border-[var(--border-color)]"
                    >
                      <td className="p-2">{feature.properties.parcelNumber}</td>
                      <td className="p-2">
                        {feature.properties.blockNumber ?? 'Not recorded'}
                      </td>
                      <td className="p-2 tabular-nums">
                        {feature.properties.revision}
                      </td>
                      <td className="p-2 tabular-nums">
                        {feature.properties.gridAreaSqM.toLocaleString(
                          undefined,
                          { maximumFractionDigits: 4 },
                        )}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`${formId}-format`}
              className="block text-sm font-medium"
            >
              Output format
            </label>
            <select
              id={`${formId}-format`}
              className="max-w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"
              value={format}
              disabled={busy || !!pending}
              onChange={(event) => {
                setFormat(z.enum(['dxf', 'geojson']).parse(event.target.value))
                setReviewed(false)
              }}
            >
              <option value="dxf">DXF — 2D project grid (Pro)</option>
              <option value="geojson">
                GeoJSON — WGS 84 longitude and latitude
              </option>
            </select>
            <p className="text-sm text-[var(--text-secondary)]">
              {format === 'dxf'
                ? 'Closed 2D outlines retain the project grid. They contain no observed beacon points or measured heights.'
                : 'Geographic interchange uses the registered projection and datum parameters. Local transformation accuracy is unverified; retain project-grid geometry for survey measurements.'}
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || !!pending}
              onChange={(event) => setReviewed(event.target.checked)}
              className="mt-1"
            />
            <span>
              I reviewed this exact parcel selection and output reference. These
              are boundary drafts; field checks and professional approval remain
              separate.
            </span>
          </label>
          <button
            type="button"
            className={action}
            disabled={
              busy ||
              !!pending ||
              !reviewed ||
              !viewer ||
              !storageReady ||
              !!deviceError
            }
            onClick={() => void run('new')}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Resolving export…' : 'Generate registered draft'}
          </button>
          <details className="text-xs">
            <summary className="cursor-pointer">
              Source and recovery details
            </summary>
            <p className="mt-2 break-all">
              Source revision: {preview.sourceRevision}
            </p>
            <p className="mt-2 break-all">
              Source SHA-256: {preview.sourceHash}
            </p>
            <p className="mt-2">
              The request is retained on this device before transmission.
              Changed source evidence is refused; historical recovery returns
              the original bytes.
            </p>
          </details>
        </section>
      )}
      {storageReady && viewer && (
        <SchemeExportHistory
          key={`${projectId}:${viewer}`}
          projectId={projectId}
          viewerId={viewer}
          refreshVersion={historyVersion}
        />
      )}
    </section>
  )
}
