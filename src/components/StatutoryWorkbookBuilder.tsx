'use client'

import { useState } from 'react'

const surveyTypes = ['cadastral', 'engineering', 'topographic', 'leveling', 'control', 'mining', 'hydrographic', 'drone', 'gnss'] as const

export default function StatutoryWorkbookBuilder() {
  const [form, setForm] = useState({
    projectName: '',
    lrNumber: '',
    parcelNumber: '',
    county: '',
    locality: '',
    surveyType: 'cadastral',
    surveyDate: new Date().toISOString().slice(0, 10),
    surveyorName: '',
    iskNumber: '',
    firmName: '',
    referenceNumber: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  async function downloadWorkbook() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/tools/statutory-workbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('Workbook generation failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${form.referenceNumber || form.projectName || 'metardu'}-statutory-workbook.xlsx`.replace(/[^\w.-]+/g, '-')
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workbook generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-red-800/60 bg-red-950/30 text-red-300 rounded p-3 text-sm">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workbook Header</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Project Name" value={form.projectName} onChange={v => set('projectName', v)} />
          <Field label="LR Number" value={form.lrNumber} onChange={v => set('lrNumber', v)} />
          <Field label="Parcel Number" value={form.parcelNumber} onChange={v => set('parcelNumber', v)} />
          <Field label="County" value={form.county} onChange={v => set('county', v)} />
          <Field label="Locality" value={form.locality} onChange={v => set('locality', v)} />
          <label className="block">
            <span className="block text-xs text-[var(--text-muted)] mb-1">Survey Type</span>
            <select className="input w-full text-sm" value={form.surveyType} onChange={event => set('surveyType', event.target.value)}>
              {surveyTypes.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ').toUpperCase()}</option>)}
            </select>
          </label>
          <Field label="Survey Date" type="date" value={form.surveyDate} onChange={v => set('surveyDate', v)} />
          <Field label="Reference Number" value={form.referenceNumber} onChange={v => set('referenceNumber', v)} placeholder="e.g. RS149_2026_001_R00" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Surveyor</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Surveyor Name" value={form.surveyorName} onChange={v => set('surveyorName', v)} />
          <Field label="ISK Number" value={form.iskNumber} onChange={v => set('iskNumber', v)} />
          <Field label="Firm Name" value={form.firmName} onChange={v => set('firmName', v)} />
        </div>
      </section>

      <div className="p-4 border border-[var(--border-color)] rounded text-xs text-[var(--text-muted)] leading-6">
        The generated workbook contains 9 statutory sheets: project details, field abstract, traverse computation,
        adjusted coordinates, levelling, area computation, bearing and distance schedule, COGO/setting out, and QA summary.
        The current tool ships with a complete compliant sample dataset so the workbook is immediately usable as a template.
      </div>

      <button
        onClick={downloadWorkbook}
        disabled={busy}
        className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-50 text-black font-bold rounded text-sm transition-colors"
      >
        {busy ? 'Generating workbook...' : 'Download 9-Sheet Statutory Workbook'}
      </button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs text-[var(--text-muted)] mb-1">{label}</span>
      <input
        className="input w-full text-sm"
        type={type}
        value={value}
        placeholder={placeholder || label}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  )
}
