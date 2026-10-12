'use client'

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react'
import { parseSettingOutSheetCsv } from '@/lib/documents/settingOutSheetCsv'

const inputClass = 'h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'

interface SheetMetadata {
  projectName: string
  surveyorName: string
  surveyorLicense: string
  checkedByName: string
  checkedByLicense: string
  date: string
  referenceStation: string
  instrument: string
  projection: string
}

export default function SettingOutSheetPage() {
  const [metadata, setMetadata] = useState<SheetMetadata>({
    projectName: '',
    surveyorName: '',
    surveyorLicense: '',
    checkedByName: '',
    checkedByLicense: '',
    date: '',
    referenceStation: '',
    instrument: '',
    projection: '',
  })
  const [pointCsv, setPointCsv] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const parsed = useMemo(() => {
    if (!pointCsv.trim()) return { points: [], error: '' }
    try {
      return { points: parseSettingOutSheetCsv(pointCsv), error: '' }
    } catch (cause) {
      return { points: [], error: cause instanceof Error ? cause.message : 'Review the point list format.' }
    }
  }, [pointCsv])

  function update(field: keyof SheetMetadata, value: string) {
    setMetadata(current => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    if (!parsed.points.length) {
      setError('Paste at least one design point before generating the sheet.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/documents/setting-out-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...metadata, points: parsed.points }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || 'The sheet could not be generated. Review the inputs and try again.')
      }

      const pdf = await response.blob()
      if (pdf.size < 8) throw new Error('The server returned an empty PDF. Your input has not been saved.')
      const projectPart = metadata.projectName.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'survey'
      const url = URL.createObjectURL(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `setting-out-${projectPart}.pdf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(`Draft PDF downloaded with ${parsed.points.length} supplied point${parsed.points.length === 1 ? '' : 's'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The setting-out sheet could not be generated.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:py-10">
      <Link href="/tools/setting-out" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Instrument stakeout workflow
      </Link>

      <header className="mb-7 flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]">
          <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Field layout · document</p>
          <h1 className="text-2xl font-bold sm:text-3xl">General setting-out sheet</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            Format supplied design coordinates into a printable schedule. METARDU does not calculate the points, transform the DXF, verify survey control, or decide whether entered checks pass.
          </p>
        </div>
      </header>

      <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">
        <strong className="font-semibold">Draft output only.</strong> A registered projected metre CRS is required and every design coordinate is range-checked. The sheet remains marked DRAFT; control, accuracy, entered checks, and construction acceptance are not verified.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section aria-labelledby="sheet-details-heading" className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <div className="mb-4">
            <h2 id="sheet-details-heading" className="text-base font-semibold">Sheet details</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Datum is filled from the registered CRS definition.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span>Project name <span aria-hidden="true" className="text-red-400">*</span></span>
              <input className={inputClass} value={metadata.projectName} maxLength={120} required onChange={event => update('projectName', event.target.value)} autoComplete="off" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Sheet date <span aria-hidden="true" className="text-red-400">*</span></span>
              <input aria-label="Sheet date" className={inputClass} type="date" value={metadata.date} required onChange={event => update('date', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Surveyor name <span aria-hidden="true" className="text-red-400">*</span></span>
              <input className={inputClass} value={metadata.surveyorName} maxLength={120} required autoComplete="name" onChange={event => update('surveyorName', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Registration / licence <span aria-hidden="true" className="text-red-400">*</span></span>
              <input className={inputClass} value={metadata.surveyorLicense} maxLength={80} required onChange={event => update('surveyorLicense', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Declared project CRS <span aria-hidden="true" className="text-red-400">*</span></span>
              <input className={inputClass} value={metadata.projection} maxLength={80} required placeholder="Registered EPSG code" onChange={event => update('projection', event.target.value)} />
              <span className="block text-xs leading-5 text-[var(--text-muted)]">Only registered projected metre systems are accepted. Coordinates are range-checked, never transformed.</span>
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Reference station</span>
              <input className={inputClass} value={metadata.referenceStation} maxLength={80} onChange={event => update('referenceStation', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span>Instrument</span>
              <input className={inputClass} value={metadata.instrument} maxLength={100} onChange={event => update('instrument', event.target.value)} />
            </label>
          </div>

          <details className="mt-5 rounded-xl border border-[var(--border-color)] p-4">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Independent check details (optional)</summary>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span>Checker name</span>
                <input className={inputClass} value={metadata.checkedByName} maxLength={120} onChange={event => update('checkedByName', event.target.value)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span>Checker registration / licence</span>
                <input className={inputClass} value={metadata.checkedByLicense} maxLength={80} onChange={event => update('checkedByLicense', event.target.value)} />
              </label>
            </div>
          </details>
        </section>

        <section aria-labelledby="point-list-heading" className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="point-list-heading" className="text-base font-semibold">Design point list</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Paste CSV or spreadsheet rows, one point per line. Required columns are point ID, design easting, and design northing.</p>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{parsed.points.length} / 1,000 points</span>
          </div>
          <label htmlFor="setting-out-points" className="mb-2 block text-sm font-medium">CSV / TSV point rows</label>
          <textarea
            id="setting-out-points"
            value={pointCsv}
            onChange={event => { setPointCsv(event.target.value); setError(''); setStatus('') }}
            rows={9}
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-3 font-mono text-xs leading-5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            placeholder={'Point ID,Design E,Design N,Bearing,Distance,Offset E,Offset N,Entered check,Remarks\nP-01,500010.000,9900000.000,,,,,,Foundation corner'}
          />
          <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Optional columns: bearing, distance (m), offset E/N (m), entered check, remarks. The “entered check” column is printed as supplied and is never treated as a verified pass.</p>
          {parsed.error && <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{parsed.error}</p>}

          {parsed.points.length > 0 && !parsed.error && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border-color)]">
              <table className="w-full min-w-[520px] text-left text-xs">
                <caption className="sr-only">Preview of the first supplied setting-out points</caption>
                <thead className="bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <tr><th className="px-3 py-2">Point ID</th><th className="px-3 py-2 text-right">Design E (m)</th><th className="px-3 py-2 text-right">Design N (m)</th><th className="px-3 py-2">Remarks</th></tr>
                </thead>
                <tbody>
                  {parsed.points.slice(0, 5).map(point => (
                    <tr key={point.pointId} className="border-t border-[var(--border-color)]">
                      <td className="px-3 py-2 font-mono">{point.pointId}</td>
                      <td className="px-3 py-2 text-right font-mono">{point.designE.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono">{point.designN.toFixed(3)}</td>
                      <td className="max-w-[16rem] truncate px-3 py-2">{point.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.points.length > 5 && <p className="border-t border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-muted)]">Previewing 5 of {parsed.points.length}; the PDF includes every valid point.</p>}
            </div>
          )}
        </section>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-xs leading-5 text-[var(--text-muted)]">
          PDF generation sends the entered metadata and point list to METARDU for formatting. This endpoint does not persist the request. Verify the project CRS, control, design source, field tolerances, and print scale before issue or construction use.
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
        {status && <p role="status" aria-live="polite" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-200">{status}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
          <Link href="/tools" className="inline-flex min-h-11 items-center px-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">All survey tools</Link>
          <button type="submit" disabled={submitting || Boolean(parsed.error) || parsed.points.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" aria-hidden="true" />
            {submitting ? 'Generating draft…' : 'Generate draft PDF'}
          </button>
        </div>
      </form>
    </main>
  )
}
