'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { AlertCircle, ArrowLeft, ArrowRight, ClipboardList, LayoutGrid, Loader2, Map, RefreshCw, Users } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import { schemeOverviewResponseSchema, type SchemeOverviewData } from '@/lib/scheme/overview'
import { PARCEL_STATUS_LABELS } from '@/types/scheme'

export default function SchemeOverview({ projectId }: { projectId: string }) {
  const [data, setData] = useState<SchemeOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blockPage, setBlockPage] = useState(1)
  const [traversePage, setTraversePage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const confirmed = data?.project.id === projectId ? data : null

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true); setError(null)
    async function load() {
      try {
        const query = new URLSearchParams({ block_page: String(blockPage), traverse_page: String(traversePage) })
        const response = await fetch(`/api/project/${projectId}/scheme-overview?${query}`, { signal: controller.signal, cache: 'no-store' })
        const body: unknown = await response.json()
        if (!response.ok) {
          const message = z.object({ error: z.string() }).safeParse(body)
          throw new Error(message.success ? message.data.error : 'The scheme overview could not be loaded.')
        }
        const parsed = schemeOverviewResponseSchema.safeParse(body)
        if (!parsed.success || parsed.data.data.project.id !== projectId) throw new Error('The overview counts or project identity are inconsistent. Retry the read.')
        if (current) setData(parsed.data.data)
      } catch (failure) { if (current) setError(failure instanceof Error ? failure.message : 'The scheme overview could not be loaded.') }
      finally { if (current) setLoading(false) }
    }
    void load()
    return () => { current = false; controller.abort() }
  }, [projectId, blockPage, traversePage, refresh])

  const actionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]'
  return <section className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:py-8" aria-label="Scheme overview">
    <nav aria-label="Scheme breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]"><Link href="/dashboard" className="hover:underline">Dashboard</Link><span aria-hidden="true">/</span><Link href="/projects" className="hover:underline">Projects</Link><span aria-hidden="true">/</span><span>Scheme overview</span></nav>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2"><p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">Cadastral scheme</p><h1 className="break-words text-2xl font-semibold text-[var(--text-primary)]">{confirmed?.project.name ?? 'Scheme overview'}</h1>{confirmed?.project.location && <p className="text-sm text-[var(--text-secondary)]">{confirmed.project.location}</p>}</div>
      <button type="button" className={actionClass} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh overview</button>
    </header>
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading scheme overview…</p>}
    {error && <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-500/30 p-4"><div className="flex min-w-0 items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" /><div><p className="text-sm">{error}</p>{confirmed && <p className="mt-1 text-xs text-[var(--text-secondary)]">Showing the last confirmed overview. Current totals could not be refreshed.</p>}</div></div><button type="button" className={actionClass} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Retry overview</button></div>}
    {confirmed && <>
      <nav aria-label="Scheme work" className="flex flex-wrap gap-2">
        <Link href={`/project/${projectId}/scheme/blocks`} className={actionClass}><LayoutGrid className="h-4 w-4" aria-hidden="true" />Manage blocks</Link>
        <Link href={`/project/${projectId}/scheme/map`} className={actionClass}><Map className="h-4 w-4" aria-hidden="true" />Scheme map</Link>
        <Link href={`/project/${projectId}/scheme/team`} className={actionClass}><Users className="h-4 w-4" aria-hidden="true" />Team and workflow</Link>
        <Link href={`/project/${projectId}/deliver`} className={actionClass}><ClipboardList className="h-4 w-4" aria-hidden="true" />Review deliverables</Link>
      </nav>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Count label="Blocks" value={confirmed.blocks.total} symbol="parcel" />
        <Count label="Total parcels" value={confirmed.parcels.total} symbol="parcel" />
        {Object.entries(confirmed.parcels.statusCounts).map(([status, value]) => <Count key={status} label={`Recorded ${PARCEL_STATUS_LABELS[status as keyof typeof PARCEL_STATUS_LABELS].toLowerCase()}`} value={value} />)}
      </div>
      {(confirmed.parcels.unassignedBlock > 0 || confirmed.parcels.invalidBlock > 0 || confirmed.parcels.unrecognized > 0) && <div className="rounded-lg border border-amber-500/30 p-4 text-sm space-y-1"><h2 className="font-medium">Register review</h2>{confirmed.parcels.unassignedBlock > 0 && <p>{confirmed.parcels.unassignedBlock.toLocaleString()} parcels are unassigned to a block and are included in the project total.</p>}{confirmed.parcels.invalidBlock > 0 && <p>{confirmed.parcels.invalidBlock.toLocaleString()} parcels have inconsistent block links.</p>}{confirmed.parcels.unrecognized > 0 && <p>{confirmed.parcels.unrecognized.toLocaleString()} parcels have unrecognized workflow statuses.</p>}</div>}
      <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)]" aria-labelledby="scheme-blocks-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] p-4"><h2 id="scheme-blocks-title" className="font-medium">Block register</h2><span className="text-xs text-[var(--text-secondary)]">{confirmed.blocks.total.toLocaleString()} blocks</span></div>
        {confirmed.blocks.total === 0 ? <div className="space-y-2 p-5"><p>No blocks have been created.</p><Link className="text-sm underline underline-offset-4" href={`/project/${projectId}/scheme/blocks`}>Create the first block</Link></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]"><tr><th className="p-3">Block</th><th className="p-3">Name</th><th className="p-3">Parcels</th><th className="p-3">Recorded submitted or approved</th><th className="p-3">Action</th></tr></thead><tbody>{confirmed.blocks.rows.map(row => <tr key={row.id} className="border-t border-[var(--border-color)]"><td className="p-3 font-mono">{row.blockNumber}</td><td className="p-3">{row.name ?? 'Not recorded'}</td><td className="p-3 tabular-nums">{row.parcelCount.toLocaleString()}</td><td className="p-3 tabular-nums">{row.submittedOrApproved.toLocaleString()}</td><td className="p-3"><Link href={`/project/${projectId}/scheme/blocks/${row.id}`} className="whitespace-nowrap underline underline-offset-4">Manage parcels</Link></td></tr>)}</tbody></table></div>}
        <Pager label="blocks" total={confirmed.blocks.total} page={confirmed.blocks.page} size={confirmed.blocks.pageSize} loading={loading} onPage={setBlockPage} />
      </section>
      <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)]" aria-labelledby="scheme-traverses-title">
        <div className="space-y-2 border-b border-[var(--border-color)] p-4"><h2 id="scheme-traverses-title" className="flex items-center gap-2 font-medium"><GeomaticsIcon symbol="traverse" className="h-4 w-4" />Traverse computation records</h2><p className="text-sm text-[var(--text-secondary)]">{confirmed.traverses.total.toLocaleString()} records; {confirmed.traverses.computed.toLocaleString()} marked computed or approved.</p><p className="text-xs text-[var(--text-secondary)]">Accuracy assessment: unassessed</p><p className="text-xs text-[var(--text-secondary)]">Recorded order and precision values need comparison with the project’s adopted criteria and retained observation checks.</p></div>
        {confirmed.traverses.total === 0 ? <p className="p-5 text-sm">No traverse computation records yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]"><tr><th className="p-3">Name</th><th className="p-3">Method</th><th className="p-3">Recorded status</th><th className="p-3">Recorded order</th><th className="p-3">Precision ratio</th><th className="p-3">Computed area (ha)</th></tr></thead><tbody>{confirmed.traverses.rows.map(row => <tr key={row.id} className="border-t border-[var(--border-color)]"><td className="p-3">{row.name ?? 'Unnamed record'}</td><td className="p-3">{row.method ?? 'Not recorded'}</td><td className="p-3">{row.status ?? 'Not recorded'}</td><td className="p-3">{row.recordedOrder ?? 'Not recorded'}</td><td className="p-3 tabular-nums">{row.precisionRatio === null ? 'Not recorded' : `1:${row.precisionRatio.toLocaleString()}`}</td><td className="p-3 tabular-nums">{row.areaHa === null ? 'Not recorded' : row.areaHa.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td></tr>)}</tbody></table></div>}
        <Pager label="traverses" total={confirmed.traverses.total} page={confirmed.traverses.page} size={confirmed.traverses.pageSize} loading={loading} onPage={setTraversePage} />
      </section>
    </>}
  </section>
}

function Count({ label, value, symbol }: { label: string; value: number; symbol?: 'parcel' }) {
  return <div aria-label={label} className="min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4"><p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">{symbol && <GeomaticsIcon symbol={symbol} className="h-4 w-4 shrink-0" />}{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>
}

function Pager({ label, total, page, size, loading, onPage }: { label: string; total: number; page: number; size: number; loading: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] p-3 text-xs"><span>Page {page.toLocaleString()} of {pages.toLocaleString()} · {total.toLocaleString()} {label}</span><div className="flex gap-2"><button type="button" aria-label={`Previous ${label} page`} disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="inline-flex items-center gap-1 rounded border border-[var(--border-color)] px-3 py-2 disabled:opacity-40"><ArrowLeft className="h-3 w-3" aria-hidden="true" />Previous</button><button type="button" aria-label={`Next ${label} page`} disabled={loading || page >= pages} onClick={() => onPage(page + 1)} className="inline-flex items-center gap-1 rounded border border-[var(--border-color)] px-3 py-2 disabled:opacity-40">Next<ArrowRight className="h-3 w-3" aria-hidden="true" /></button></div></nav>
}
