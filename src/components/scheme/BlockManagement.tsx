'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import {
  CreateBlockSchema,
  UpdateBlockSchema,
} from '@/lib/validation/blockInputs'
import {
  blockCommandResponseSchema,
  blockDeleteResponseSchema,
  blockDirectoryResponseSchema,
  type BlockDirectoryData,
  type BlockDirectoryRow,
} from '@/lib/scheme/blockDirectory'

interface Fields {
  block_number: string
  block_name: string
  description: string
}
const fieldsFor = (row?: BlockDirectoryRow): Fields => ({
  block_number: row?.block_number ?? '',
  block_name: row?.block_name ?? '',
  description: row?.description ?? '',
})
const text = (value: string) => value.trim() || null
const action =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] disabled:opacity-40'

export default function BlockManagement({ projectId }: { projectId: string }) {
  const [data, setData] = useState<BlockDirectoryData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [refresh, setRefresh] = useState(0)
  const [creating, setCreating] = useState(false),
    [editing, setEditing] = useState<BlockDirectoryRow | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  const mounted = useRef(true),
    mutation = useRef(false),
    confirmed = data?.project.id === projectId ? data : null
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true)
    setError(null)
    async function load() {
      try {
        const params = new URLSearchParams({
          project_id: projectId,
          page: String(page),
          q: query,
        })
        const response = await fetch(`/api/scheme/blocks?${params}`, {
            signal: controller.signal,
            cache: 'no-store',
          }),
          body: unknown = await response.json()
        if (!response.ok) {
          const message = z.object({ error: z.string() }).safeParse(body)
          throw new Error(
            message.success
              ? message.data.error
              : 'The block directory could not be loaded.',
          )
        }
        const parsed = blockDirectoryResponseSchema.safeParse(body)
        if (!parsed.success || parsed.data.project.id !== projectId)
          throw new Error(
            'The block directory identity or counts are inconsistent.',
          )
        const expected = Math.min(
          page,
          Math.max(
            1,
            Math.ceil(parsed.data.meta.total / parsed.data.meta.pageSize),
          ),
        )
        if (
          parsed.data.meta.page !== expected ||
          parsed.data.meta.search !== query
        )
          throw new Error(
            'The block directory does not match the requested page or filter.',
          )
        if (current) setData(parsed.data)
      } catch (failure) {
        if (current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'The block directory could not be loaded.',
          )
      } finally {
        if (current) setLoading(false)
      }
    }
    void load()
    return () => {
      current = false
      controller.abort()
    }
  }, [projectId, page, query, refresh])

  async function save(fields: Fields, row?: BlockDirectoryRow) {
    if (mutation.current) return
    let payload: Record<string, unknown>
    if (row) {
      const original = fieldsFor(row),
        changes: Record<string, unknown> = {}
      for (const field of [
        'block_number',
        'block_name',
        'description',
      ] as const)
        if (fields[field] !== original[field])
          changes[field] =
            field === 'block_number' ? fields[field] : text(fields[field])
      if (!Object.keys(changes).length) {
        setEditing(null)
        setNotice('No block metadata changes to save.')
        return
      }
      const parsed = UpdateBlockSchema.safeParse({
        ...changes,
        project_id: projectId,
        updated_at: row.updated_at,
        row_version: row.row_version,
      })
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the block fields.')
        return
      }
      payload = parsed.data
    } else {
      const parsed = CreateBlockSchema.safeParse({
        project_id: projectId,
        block_number: fields.block_number,
        block_name: text(fields.block_name),
        description: text(fields.description),
      })
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Check the block fields.')
        return
      }
      payload = parsed.data
    }
    mutation.current = true
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      const response = await fetch(
          row ? `/api/scheme/blocks/${row.id}` : '/api/scheme/blocks',
          {
            method: row ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        ),
        body: unknown = await response.json()
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(body)
        throw new Error(
          message.success
            ? message.data.error
            : 'The block change could not be confirmed.',
        )
      }
      const parsed = blockCommandResponseSchema.safeParse(body)
      if (
        !parsed.success ||
        parsed.data.data.project_id !== projectId ||
        (row &&
          (parsed.data.data.id !== row.id ||
            parsed.data.data.row_version === row.row_version ||
            parsed.data.data.updated_at === row.updated_at))
      )
        throw new Error(
          'The block acknowledgement does not match the intended record. Refresh before retrying.',
        )
      for (const [field, value] of Object.entries(payload)) {
        if (field === 'updated_at' || field === 'row_version') continue
        if ((parsed.data.data as Record<string, unknown>)[field] !== value)
          throw new Error(
            'The block acknowledgement does not match the supplied metadata. Refresh before retrying.',
          )
      }
      if (!mounted.current) return
      setNotice(
        row ? 'Block change acknowledged.' : 'Block creation acknowledged.',
      )
      setCreating(false)
      setEditing(null)
      setRefresh((value) => value + 1)
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The block result is unconfirmed. Refresh before retrying.',
        )
    } finally {
      mutation.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function remove(row: BlockDirectoryRow) {
    if (
      mutation.current ||
      !row.can_delete ||
      !window.confirm(
        `Permanently delete empty block ${row.block_number}? Its register metadata cannot be restored through this screen.`,
      )
    )
      return
    mutation.current = true
    setBusy(true)
    setError(null)
    setNotice('')
    try {
      const params = new URLSearchParams({
        project_id: projectId,
        updated_at: row.updated_at,
        row_version: row.row_version,
      })
      const response = await fetch(`/api/scheme/blocks/${row.id}?${params}`, {
          method: 'DELETE',
        }),
        body: unknown = await response.json()
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(body)
        throw new Error(
          message.success
            ? message.data.error
            : 'The block deletion could not be confirmed.',
        )
      }
      const parsed = blockDeleteResponseSchema.safeParse(body)
      if (
        !parsed.success ||
        parsed.data.data.deletedId !== row.id ||
        parsed.data.data.projectId !== projectId ||
        parsed.data.data.rowVersion !== row.row_version
      )
        throw new Error(
          'The deletion acknowledgement does not match the selected block. Refresh before retrying.',
        )
      if (!mounted.current) return
      setNotice('Empty block deletion acknowledged.')
      setRefresh((value) => value + 1)
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The deletion result is unconfirmed. Refresh before retrying.',
        )
    } finally {
      mutation.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <section
      className="mx-auto w-full min-w-0 max-w-6xl space-y-5 px-4 py-6"
      aria-label="Block management"
    >
      <nav
        aria-label="Blocks breadcrumb"
        className="flex flex-wrap gap-2 text-sm text-[var(--text-secondary)]"
      >
        <Link href="/projects" className="underline underline-offset-4">
          Projects
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/project/${projectId}/overview`}
          className="underline underline-offset-4"
        >
          Project overview
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Block management
          </p>
          <h1 className="mt-1 break-words text-2xl font-semibold">
            {confirmed?.project.name ?? 'Blocks'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || busy}
            className={action}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh blocks
          </button>
          {confirmed?.project.canCreate && (
            <button
              type="button"
              disabled={busy}
              className={action}
              onClick={() => {
                setCreating(true)
                setEditing(null)
                setError(null)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add block
            </button>
          )}
        </div>
      </header>
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading block directory…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-500/30 p-4"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm">{error}</p>
              {confirmed && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Showing the last confirmed block directory. Keep unsaved edits
                  until you review the current record.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            className={action}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry block directory
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--border-color)] p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {confirmed && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Project blocks" value={confirmed.summary.blocks} />
            <Stat label="Project parcels" value={confirmed.summary.parcels} />
            <Stat
              label="Recorded submitted or approved"
              value={confirmed.summary.submittedOrApproved}
            />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {confirmed.summary.unassignedParcels.toLocaleString()} parcels are
            unassigned; {confirmed.summary.invalidBlockLinks.toLocaleString()}{' '}
            have inconsistent block links. Project totals include these records.
          </p>
          {!confirmed.project.canCreate && (
            <p className="rounded-lg border border-[var(--border-color)] p-3 text-sm">
              This project is not configured as a scheme. Existing records
              remain visible; create new blocks in a scheme project.
            </p>
          )}
          {confirmed.summary.receiptRetention === 'unavailable' && (
            <p className="rounded-lg border border-amber-500/30 p-3 text-sm">
              Deletion is unavailable while import-receipt retention cannot be
              checked. Reads, creation and metadata edits remain available.
            </p>
          )}
          {creating && (
            <BlockForm
              key="new"
              busy={busy}
              onSave={(values) => save(values)}
              onCancel={() => setCreating(false)}
            />
          )}
          <form
            className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-color)] p-4"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              setQuery(search.trim())
            }}
          >
            <label className="min-w-0 flex-1 space-y-1 text-xs">
              <span>Search block number or name</span>
              <input
                maxLength={80}
                value={search}
                disabled={busy}
                onChange={(event) => setSearch(event.target.value)}
                className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"
              />
            </label>
            <button type="submit" disabled={busy || loading} className={action}>
              Apply block filter
            </button>
          </form>
          <div className="space-y-3">
            {confirmed.data.map((row) =>
              editing?.id === row.id ? (
                <BlockForm
                  key={row.id}
                  row={editing}
                  busy={busy}
                  onSave={(values) => save(values, editing)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <article
                  key={row.id}
                  className="flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--border-color)] p-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="flex items-center gap-2 font-mono text-sm">
                      <GeomaticsIcon
                        symbol="parcel"
                        className="h-4 w-4 shrink-0"
                      />
                      {row.block_number}
                    </p>
                    <Link
                      href={`/project/${projectId}/scheme/blocks/${row.id}`}
                      className="block break-words font-medium underline underline-offset-4"
                    >
                      {row.block_name ?? `Block ${row.block_number}`}
                    </Link>
                    {row.description && (
                      <p className="break-words text-sm text-[var(--text-secondary)]">
                        {row.description}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)]">
                      {row.parcel_count.toLocaleString()} parcels ·{' '}
                      {row.completed_count.toLocaleString()} recorded submitted
                      or approved · {row.assignment_count.toLocaleString()}{' '}
                      assignments
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-label={`Edit block ${row.block_number}`}
                      disabled={busy}
                      className={action}
                      onClick={() => {
                        setEditing(row)
                        setCreating(false)
                        setError(null)
                      }}
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete block ${row.block_number}`}
                      disabled={busy || !row.can_delete}
                      title={
                        row.can_delete
                          ? 'Delete empty metadata block'
                          : 'Retained records, geometry or an unavailable retention check prevent deletion'
                      }
                      className={action}
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
          {confirmed.meta.total === 0 && (
            <p className="rounded-lg border border-[var(--border-color)] p-5 text-sm">
              {confirmed.summary.blocks === 0
                ? 'No blocks recorded in this project.'
                : 'No blocks match this filter.'}
            </p>
          )}
          <nav
            aria-label="Block directory pages"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] p-3 text-xs"
          >
            <span>
              Page {confirmed.meta.page.toLocaleString()} of{' '}
              {Math.max(
                1,
                Math.ceil(confirmed.meta.total / confirmed.meta.pageSize),
              ).toLocaleString()}{' '}
              · {confirmed.meta.total.toLocaleString()} matching blocks
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous blocks page"
                disabled={loading || busy || confirmed.meta.page <= 1}
                className={action}
                onClick={() => setPage(confirmed.meta.page - 1)}
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Previous
              </button>
              <button
                type="button"
                aria-label="Next blocks page"
                disabled={
                  loading ||
                  busy ||
                  confirmed.meta.page * confirmed.meta.pageSize >=
                    confirmed.meta.total
                }
                className={action}
                onClick={() => setPage(confirmed.meta.page + 1)}
              >
                Next
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  )
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      aria-label={label}
      className="min-w-0 rounded-lg border border-[var(--border-color)] p-4"
    >
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  )
}
function BlockForm({
  row,
  busy,
  onSave,
  onCancel,
}: {
  row?: BlockDirectoryRow
  busy: boolean
  onSave: (fields: Fields) => Promise<void>
  onCancel: () => void
}) {
  const [fields, setFields] = useState(() => fieldsFor(row))
  return (
    <form
      aria-label={row ? 'Edit block metadata' : 'Create block metadata'}
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(fields)
      }}
      className="space-y-4 rounded-xl border border-[var(--border-color)] p-4"
    >
      <h2 className="text-sm font-medium">
        {row ? `Edit ${row.block_number}` : 'New block metadata'}
      </h2>
      <fieldset
        disabled={busy}
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {(['block_number', 'block_name', 'description'] as const).map(
          (field) => (
            <label key={field} className="min-w-0 space-y-1 text-xs">
              <span>
                {
                  {
                    block_number: 'Block number',
                    block_name: 'Block name',
                    description: 'Description',
                  }[field]
                }
              </span>
              <input
                value={fields[field]}
                required={field === 'block_number'}
                maxLength={
                  field === 'block_number'
                    ? 20
                    : field === 'block_name'
                      ? 100
                      : 500
                }
                onChange={(event) =>
                  setFields((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
                className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-sm"
              />
            </label>
          ),
        )}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={action}
        >
          Cancel
        </button>
        <button type="submit" disabled={busy} className={action}>
          {busy && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {row ? 'Save block changes' : 'Create block'}
        </button>
      </div>
    </form>
  )
}
