'use client'
import { useEffect, useState } from 'react'
import {
  schemeExportHistorySchema,
  type SchemeExportHistory as HistoryData,
} from '@/lib/scheme/exportContract'
import { readSchemeExportJson } from '@/lib/scheme/exportClient'
const action =
  'inline-flex items-center justify-center rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-40'
export default function SchemeExportHistory({
  projectId,
  viewerId,
  refreshVersion,
}: {
  projectId: string
  viewerId: string
  refreshVersion: number
}) {
  const [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0),
    [data, setData] = useState<HistoryData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 30000)
    setLoading(true)
    setError('')
    setData(null)
    void (async () => {
      try {
        const response = await fetch(
            `/api/project/${projectId}/scheme/exports?mode=history&page=${page}`,
            { signal: controller.signal, cache: 'no-store' },
          ),
          value = await readSchemeExportJson(response),
          parsed = schemeExportHistorySchema.safeParse(
            value && typeof value === 'object' && 'data' in value
              ? value.data
              : null,
          )
        if (
          !parsed.success ||
          parsed.data.projectId !== projectId ||
          parsed.data.viewerId !== viewerId ||
          parsed.data.page !== page
        )
          throw new Error(
            'The export history reply does not match this account, project and page.',
          )
        if (active && !controller.signal.aborted) setData(parsed.data)
      } catch (failure) {
        if (active)
          setError(
            controller.signal.aborted
              ? 'Export history timed out. Retry the read.'
              : failure instanceof Error
                ? failure.message
                : 'Export history is unavailable.',
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
  }, [projectId, viewerId, page, attempt, refreshVersion])
  const current =
    data?.projectId === projectId &&
    data.viewerId === viewerId &&
    data.page === page
      ? data
      : null
  return (
    <section
      className="space-y-3 rounded-xl border border-[var(--border-color)] p-4"
      aria-label="Your export history"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Your retained export history</h2>
        <button
          type="button"
          className={action}
          disabled={loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Reload export history
        </button>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        Recover an earlier registered file even after the current parcel
        geometry or device recovery record has changed. Cancelled request IDs
        remain closed.
      </p>
      {loading && (
        <p role="status" className="text-sm">
          Loading retained export history…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {current && (
        <>
          <p className="text-sm">
            {current.total.toLocaleString()} retained requests for your account
            in this project.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Saved outcome</th>
                  <th className="p-2">Selection</th>
                  <th className="p-2">Saved grid</th>
                  <th className="p-2">Request</th>
                  <th className="p-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {current.rows.map((row) => (
                  <tr
                    key={row.requestId}
                    className="border-t border-[var(--border-color)]"
                  >
                    <td className="p-2">
                      {row.outcome === 'committed'
                        ? `Registered draft R${row.revision}`
                        : 'Cancelled'}
                      <p className="mt-1 text-xs">{row.createdAt}</p>
                    </td>
                    <td className="p-2">
                      {row.parcelCount} parcels · {row.format.toUpperCase()}
                    </td>
                    <td className="p-2">
                      {row.sourceCrs ?? 'No output generated'}
                    </td>
                    <td className="max-w-48 break-all p-2 font-mono text-xs">
                      {row.requestId}
                    </td>
                    <td className="p-2">
                      {row.outcome === 'committed' ? (
                        <a
                          className="underline underline-offset-4"
                          href={`/api/scheme/export/${row.format}?${new URLSearchParams({ project_id: projectId, request_id: row.requestId })}`}
                        >
                          Recover saved {row.format.toUpperCase()}
                        </a>
                      ) : (
                        'No file'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!current.rows.length && (
            <p className="text-sm">
              {current.total === 0
                ? 'No retained exports or cancellations for this account.'
                : 'No requests on this page.'}
            </p>
          )}
          <nav
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Export history pages"
          >
            <span>
              Page {page} of {Math.max(1, Math.ceil(current.total / 24))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={action}
                disabled={loading || page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous exports
              </button>
              <button
                type="button"
                className={action}
                disabled={loading || page * 24 >= current.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next exports
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  )
}
