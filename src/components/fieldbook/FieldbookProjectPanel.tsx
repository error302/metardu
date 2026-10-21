'use client'

import { useRef, useState } from 'react'
import { Download, FolderOpen, Save, Upload, ChevronDown } from 'lucide-react'
import { parseFieldbookTransfer, type FieldbookTransfer } from '@/lib/fieldbook/transfer'
import type { SavedFieldbook as Book } from '@/app/fieldbook/types'

interface Props {
  projectId: string
  projects: { id: string; name: string }[]
  projectsError: string | null
  onRetryProjects?: () => void
  name: string
  onNameChange: (name: string) => void
  onProjectChange: (id: string) => Promise<void>
  saving: boolean
  onSave: () => Promise<boolean>
  onNew?: () => Promise<void>
  status: string | null
  error: boolean
  savedBooks: Book[]
  activeBookId: string | null
  onOpen: (book: Book) => void | Promise<void>
  onImport?: (book: FieldbookTransfer) => Promise<void>
  onExportJSON: () => void
  onExportCSV: () => Promise<void>
  onExportPDF: () => Promise<void>
}

export function FieldbookProjectPanel(props: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  async function run(action: () => void | Promise<void>) {
    setBusy(true); setError(null)
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'That action failed. Your open book is still available.') }
    finally { setBusy(false) }
  }
  const disabled = busy || props.saving
  return (
    <section aria-label="Fieldbook workspace" className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-5 lg:rounded-xl lg:border lg:p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">METARDU / FIELDWORK</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)] lg:text-base">Your fieldbook</h1>
        </div>
        <FolderOpen className="mt-1 h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      <label className="block text-sm font-medium text-[var(--text-secondary)]">
        Project
        <select aria-label="Fieldbook project" value={props.projectId} disabled={disabled}
          onChange={event => { const id = event.target.value; void run(() => props.onProjectChange(id)) }}
          className="input mt-1.5 min-h-12 w-full text-base">
          <option value="">Choose a project</option>
          {props.projectId && !props.projects.some(p => p.id === props.projectId) && <option value={props.projectId}>Current project · {props.projectId.slice(0, 8)}</option>}
          {props.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">Your current book is saved before switching projects. New project books start with a blank setup.</p>
      {props.projectsError && <p role="alert" className="mt-2 text-sm text-red-400">{props.projectsError}</p>}
      {props.projectsError && props.onRetryProjects && <button type="button" className="btn btn-secondary mt-2 min-h-11 text-sm" disabled={disabled} onClick={props.onRetryProjects}>Retry account & projects</button>}
      {!props.projectId && <p className="mt-3 rounded-lg bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">Choose a project before collecting or saving observations.</p>}
      <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">
        Book name
        <input className="input mt-1.5 min-h-12 w-full text-base" value={props.name} onChange={event => props.onNameChange(event.target.value)} placeholder="e.g. Northern access road · day 1" />
      </label>
      <button type="button" disabled={disabled || !props.projectId} onClick={() => void run(async () => { await props.onSave() })}
        className="btn btn-primary mt-3 min-h-12 w-full gap-2"><Save className="h-4 w-4" />{props.saving ? 'Saving…' : 'Save fieldbook'}</button>
      {props.onNew && <button type="button" disabled={disabled || !props.projectId} onClick={() => void run(async () => { await props.onNew?.() })} className="btn btn-secondary mt-2 min-h-12 w-full text-sm">Save & start a new book</button>}
      {(props.status || error) && <p role={props.error || error ? 'alert' : 'status'} className={`mt-3 text-sm leading-relaxed ${props.error || error ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>{error ?? props.status}</p>}
      <details className="group mt-4 border-t border-[var(--border-color)] pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--text-primary)]">Files & saved books<ChevronDown className="h-4 w-4 group-open:rotate-180" /></summary>
        <div className="mt-2 space-y-3">
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">JSON keeps every raw observation and setup. CSV is a spreadsheet copy; PDF is a report.</p>
          <div className="grid grid-cols-3 gap-2">
            {(['JSON', 'CSV', 'PDF'] as const).map(format => <button key={format} disabled={disabled} type="button" className="btn btn-secondary min-h-12 gap-1 text-xs"
              onClick={() => void run(format === 'JSON' ? props.onExportJSON : format === 'CSV' ? props.onExportCSV : props.onExportPDF)}><Download className="h-3.5 w-3.5" />{format}</button>)}
          </div>
          {props.onImport && <>
            <input ref={fileRef} type="file" accept=".json,application/json" aria-label="Import METARDU fieldbook JSON" className="sr-only" onChange={event => {
              const file = event.target.files?.[0]; event.target.value = ''
              if (!file) return
              void run(async () => {
                if (file.size > 10 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 10 MB.')
                const book = parseFieldbookTransfer(await file.text())
                await props.onImport?.(book)
              })
            }} />
            <button disabled={disabled || !props.projectId} onClick={() => fileRef.current?.click()} className="btn btn-secondary min-h-12 w-full gap-2 text-sm"><Upload className="h-4 w-4" />Import METARDU JSON</button>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">Imports open as a new book in the selected project. The current book is saved first. Proprietary instrument jobs need a supported export format.</p>
          </>}
          <label className="block text-sm text-[var(--text-secondary)]">Open a saved book
            <select aria-label="Open saved fieldbook" className="input mt-1.5 min-h-12 w-full text-base" value={props.activeBookId ?? ''} disabled={disabled || !props.projectId} onChange={event => {
              const book = props.savedBooks.find(item => item.id === event.target.value)
              if (book) void run(async () => { if (await props.onSave()) await props.onOpen(book) })
            }}>
              <option value="">Choose a saved book ({props.savedBooks.length})</option>
              {props.savedBooks.map(book => <option key={book.id} value={book.id}>{book.name || 'Untitled fieldbook'}</option>)}
            </select>
          </label>
          <details className="text-sm text-[var(--text-secondary)]"><summary className="min-h-11 cursor-pointer py-3">Using an Android controller</summary>
            <p className="pb-2 text-xs leading-relaxed">Open METARDU in Chrome, then use its menu → Install app or Add to Home screen when available. Match the instrument protocol before connecting. Bluetooth pairing alone does not establish a measurement stream. Keep a JSON backup before leaving site; installation alone does not guarantee offline access.</p>
          </details>
        </div>
      </details>
    </section>
  )
}
