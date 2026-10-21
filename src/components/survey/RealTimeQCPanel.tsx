'use client'

import type { BookQualitySummary } from '@/lib/fieldbook/qualitySummary'

/** Read-only view of the active book's established engine result. */
export function RealTimeQCPanel({ summary }: { summary: BookQualitySummary }) {
  return <section aria-label="Active book checks" className="space-y-3">
    <div>
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Active book checks</h2>
      <p className="text-xs capitalize text-[var(--text-muted)]">{summary.type} · {summary.needsInput ? 'Assessment incomplete' : 'Numerical results'}</p>
    </div>
    <dl className="space-y-2">
      {summary.metrics.map(metric => <div key={metric.label} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--text-muted)]">{metric.label}</dt>
        <dd className="font-mono text-[var(--text-primary)]">{metric.value}</dd>
      </div>)}
    </dl>
    {summary.messages.map(message => <p key={message} className="text-xs leading-relaxed text-[var(--text-secondary)]">{message}</p>)}
    <p className="text-xs leading-relaxed text-[var(--text-muted)]">Numerical results do not establish field verification or professional approval.</p>
  </section>
}
