'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Award, FileSpreadsheet, FileText, Map, Search, ListChecks } from 'lucide-react'
import styles from './reports.module.css'

const tools = [
  { title: 'Survey report', icon: FileText, href: '/tools/survey-report-builder', scope: 'Project required', description: 'Assemble observations and computations into a saved report. Preview and download PDF or Word.' },
  { title: 'Deed plan', icon: Map, href: '/deed-plan', scope: 'Project or manual draft', description: 'Draw a parcel from ordered boundary coordinates. Review the plan and bearing schedule before export.' },
  { title: 'RIM register', icon: ListChecks, href: '/rim', scope: 'Project required', description: 'Save the parcel register and beacon schedule for a section. Export both as a draft PDF.' },
  { title: 'Beacon certificate', icon: Award, href: '/tools/beacon-certificate', scope: 'Manual draft', description: 'Enter beacon coordinates and condition notes, then print the certificate or download its data.' },
  { title: 'Survey review workbook', icon: FileSpreadsheet, href: '/tools/statutory-workbook', scope: 'Project or blank template', description: 'Download a blank workbook or assemble a review copy from saved project evidence.' },
]

export default function ReportsPage() {
  const [query, setQuery] = useState('')
  const term = query.trim().toLowerCase()
  const visible = tools.filter(tool => (tool.title + ' ' + tool.description + ' ' + tool.scope).toLowerCase().includes(term))
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-7 sm:px-7 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border-color)] pb-6">
        <div className="space-y-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Survey documents</h1>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">Prepare reports, plans and schedules. Open a project to work from its saved survey records.</p>
        </div>
        <Link href="/projects" className={'btn btn-primary inline-flex min-h-11 items-center gap-2 ' + styles.action}>Open a project <ArrowRight size={16} aria-hidden="true" /></Link>
      </header>
      <section aria-label="Document tools" className="space-y-4">
        <label className="relative block max-w-sm">
          <span className="sr-only">Find a document tool</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a document tool" className="input min-h-11 w-full pl-10" />
        </label>
        {visible.length === 0 ? <p role="status" className="py-6 text-sm text-[var(--text-secondary)]">No tools match this search.</p> : (
          <ul className={styles.tools}>
            {visible.map(({ title, icon: Icon, href, scope, description }) => (
              <li key={href}>
                <Link href={href} prefetch={false} className={'group grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-2 py-3 sm:gap-4 sm:px-4 ' + styles.action}>
                  <span className="grid size-10 place-items-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]"><Icon size={19} strokeWidth={1.75} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-semibold">{title}</span>
                      <span className="text-xs text-[var(--text-secondary)]">{scope}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-[var(--text-secondary)]">{description}</span>
                  </span>
                  <ArrowRight size={17} className="text-[var(--accent)]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
