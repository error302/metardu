'use client'

import { useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { apiGet } from '@/lib/api/client'

const reportList = z.object({ reports: z.array(z.object({
  id: z.string().uuid(), report_title: z.string().nullable(), report_number: z.string().nullable(),
})) })
type SavedReport = z.infer<typeof reportList>['reports'][number]
type State = { status: 'idle' | 'loading' } | { status: 'error'; message: string } | { status: 'ready'; reports: SavedReport[] }

export function ProjectDocumentTools({ projectId }: { projectId: string }) {
  const id = encodeURIComponent(projectId)
  const reportUrl = '/tools/survey-report-builder?projectId=' + id
  const [state, setState] = useState<State>({ status: 'idle' })

  async function load() {
    if (state.status === 'loading') return
    setState({ status: 'loading' })
    try {
      const { reports } = await apiGet('/api/survey-report/save?projectId=' + id, reportList, { ttlMs: 0 })
      setState({ status: 'ready', reports })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load survey reports.' })
    }
  }

  return (
    <section className="mb-6 space-y-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4" aria-label="Project document tools">
      <h2 className="text-base font-semibold">Prepare a project document</h2>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary min-h-11" href={reportUrl}>New survey report</Link>
        <Link className="btn btn-secondary min-h-11" href={'/deed-plan?project=' + id}>Draft deed plan</Link>
        <Link className="btn btn-secondary min-h-11" href={'/rim?projectId=' + id}>RIM register</Link>
        <Link className="btn btn-secondary min-h-11" href={'/tools/statutory-workbook?projectId=' + id}>Review workbook</Link>
      </div>
      <details onToggle={event => { if (event.currentTarget.open && state.status === 'idle') void load() }}>
        <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">Saved survey reports</summary>
        <div aria-busy={state.status === 'loading'} className="space-y-2 text-sm text-[var(--text-secondary)]">
          {state.status === 'loading' && <p role="status">Loading reports…</p>}
          {state.status === 'error' && <><p role="alert">{state.message}</p><button type="button" onClick={() => void load()} className="btn btn-secondary">Retry</button></>}
          {state.status === 'ready' && (state.reports.length ? (
            <ul className="space-y-2">{state.reports.map(report => (
              <li key={report.id}><Link className="underline" href={reportUrl + '&reportId=' + encodeURIComponent(report.id)}>{report.report_title || report.report_number || 'Survey report'}</Link></li>
            ))}</ul>
          ) : <p>No reports have been saved for this project.</p>)}
        </div>
      </details>
    </section>
  )
}
