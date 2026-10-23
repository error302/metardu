'use client';

import { useEffect, useRef, useState } from 'react'
import { verticalCurve, type VerticalCurveInput, type VerticalCurveResult } from '@/lib/computations/roadDesignEngine'
import { VerticalCurveProfile } from '@/components/tools/VerticalCurveProfile'
import { verticalCurveDraftCsv } from '@/lib/engineering/verticalCurveDraftCsv'

export default function VerticalCurveCalculator() {
  const [result, setResult] = useState<VerticalCurveResult | null>(null)
  const [calculatedInput, setCalculatedInput] = useState<VerticalCurveInput | null>(null)
  const [exporting, setExporting] = useState(false)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])
  const [error, setError] = useState('')
  const [g1, setG1] = useState('')
  const [g2, setG2] = useState('')
  const [vpiCh, setVpiCh] = useState('')
  const [vpiRL, setVpiRL] = useState('')
  const [lengthMode, setLengthMode] = useState<'L' | 'K'>('L')
  const [L, setL] = useState('')
  const [K, setK] = useState('')
  const [interval, setInterval] = useState('20')

  function edit(change: () => void) {
    revision.current++
    setResult(null)
    setCalculatedInput(null)
    setExporting(false)
    setError('')
    change()
  }
  function number(value: string, label: string) {
    const text = value.trim()
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`${label} requires a finite number.`)
    return Number(text)
  }
  function compute() {
    revision.current++
    setResult(null)
    setCalculatedInput(null)
    setExporting(false)
    setError('')
    try {
      const input: VerticalCurveInput = {
        g1: number(g1, 'Incoming grade'), g2: number(g2, 'Outgoing grade'),
        vpiChainage: number(vpiCh, 'VPI chainage'), vpiRL: number(vpiRL, 'VPI reduced level'),
        curveLength: lengthMode === 'L' ? number(L, 'Curve length') : undefined,
        kValue: lengthMode === 'K' ? number(K, 'K value') : undefined,
        interval: number(interval, 'RL table interval'),
      }
      setResult(verticalCurve(input))
      setCalculatedInput(input)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to calculate this vertical curve.')
    }
  }

  async function exportDraft(format: 'pdf' | 'csv') {
    if (!calculatedInput) return
    const snapshot = calculatedInput
    const current = revision.current
    setExporting(true)
    setError('')
    try {
      let content: string | Uint8Array
      if (format === 'csv') content = verticalCurveDraftCsv(snapshot)
      else {
        const exporter = await import('@/lib/engineering/verticalCurveDraft')
        if (current !== revision.current) return
        content = exporter.verticalCurveDraftPdf(snapshot)
      }
      const bytes = typeof content === 'string' ? content : new Uint8Array(content).buffer
      const url = URL.createObjectURL(new Blob([bytes], { type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      try {
        anchor.href = url; anchor.download = `vertical-curve-local-draft.${format}`
        document.body.appendChild(anchor); anchor.click()
      } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Unable to export this curve.')
    } finally { if (current === revision.current) setExporting(false) }
  }

  function fmtCh(ch: number) {
    return ch.toFixed(3)
  }

  return (
    <div className="min-w-0 space-y-6">
      <p className="text-sm text-[var(--text-muted)]">Symmetrical parabolic profile. Enter signed grades in percent, VPI chainage and reduced level in metres, then choose horizontal length or K (m/%). Project design criteria and field checks are separate.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="g-incoming-grade">G₁ — Incoming Grade (%)</label>
          <input id="g-incoming-grade" aria-label="G₁ — Incoming Grade (%)" value={g1} onChange={e => edit(() => setG1(e.target.value))} type="number" step="any"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="g-outgoing-grade">G₂ — Outgoing Grade (%)</label>
          <input id="g-outgoing-grade" aria-label="G₂ — Outgoing Grade (%)" value={g2} onChange={e => edit(() => setG2(e.target.value))} type="number" step="any"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="vpi-chainage-m">VPI Chainage (m)</label>
          <input id="vpi-chainage-m" aria-label="VPI Chainage (m)" value={vpiCh} onChange={e => edit(() => setVpiCh(e.target.value))} type="number" step="any"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="vpi-reduced-level-m">VPI Reduced Level (m)</label>
          <input id="vpi-reduced-level-m" aria-label="VPI Reduced Level (m)" value={vpiRL} onChange={e => edit(() => setVpiRL(e.target.value))} type="number" step="any"
            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        <div>
          <div className="block text-xs text-[var(--text-muted)] mb-1">Length Mode</div>
          <div className="flex gap-1">
            <button aria-pressed={lengthMode === 'L'} onClick={() => edit(() => setLengthMode('L'))} className={`flex-1 px-2 py-2 text-xs rounded ${lengthMode === 'L' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-muted)]'}`}>L (m)</button>
            <button aria-pressed={lengthMode === 'K'} onClick={() => edit(() => setLengthMode('K'))} className={`flex-1 px-2 py-2 text-xs rounded ${lengthMode === 'K' ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-muted)]'}`}>K</button>
          </div>
        </div>
        {lengthMode === 'L' ? (
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="curve-length-l-m">Curve Length L (m)</label>
            <input id="curve-length-l-m" aria-label="Curve Length L (m)" value={L} onChange={e => edit(() => setL(e.target.value))} type="number" min="0" step="any"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor="k-value">K Value</label>
            <input id="k-value" aria-label="K Value" value={K} onChange={e => edit(() => setK(e.target.value))} type="number" min="0" step="any"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={compute} className="px-5 py-2 bg-[var(--accent)] text-black rounded text-sm font-medium hover:opacity-90">
          Compute
        </button>
        <div>
          <label className="text-xs text-[var(--text-muted)] mr-1" htmlFor="rl-table-interval-m">RL Table Interval (m)</label>
          <input id="rl-table-interval-m" aria-label="RL Table Interval (m)" value={interval} onChange={e => edit(() => setInterval(e.target.value))} type="number" min="0" step="any"
            className="w-20 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
        </div>
        {result && (
          <span role="status" className="text-xs text-[var(--text-muted)]">Endpoint numerical identity consistent · field checks still required</span>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {!result && !error && <p className="text-sm text-[var(--text-muted)]">Enter or update the inputs, then compute to show current results.</p>}
      {result && calculatedInput && <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={exporting} onClick={() => void exportDraft('pdf')} className="px-4 py-2 border border-[var(--border-color)] rounded text-sm disabled:opacity-50">Export Local Draft PDF</button>
          <button type="button" disabled={exporting} onClick={() => void exportDraft('csv')} className="px-4 py-2 border border-[var(--border-color)] rounded text-sm disabled:opacity-50">Export Local Draft CSV</button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Local calculation draft. Datum and project placement are unverified; standard compliance is not assessed. PDF uses four decimal places; CSV retains calculation precision.</p>
      </div>}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Algebraic Diff A (%)', `${result.A.toFixed(4)}%`],
              ['Horizontal Length L (m)', `${result.L.toFixed(4)} m`],
              ['K (m/%)', result.K === null ? 'Undefined (equal grades)' : result.K.toFixed(4)],
              ['Curve Type', result.curveType === 'straight' ? 'Straight (A = 0)' : result.isCrest ? 'Crest (A < 0)' : 'Sag (A > 0)'],
              ['BVC Chainage (m)', fmtCh(result.bvcChainage)],
              ['BVC RL (m)', result.bvcRL.toFixed(4)],
              ['EVC Chainage (m)', fmtCh(result.evcChainage)],
              ['EVC RL (m)', result.evcRL.toFixed(4)],
              ['Stationary Chainage (m)', result.chainagePeak === null ? 'No unique point on curve' : fmtCh(result.chainagePeak)],
              ['Stationary RL (m)', result.rlPeak === null ? 'Not applicable' : result.rlPeak.toFixed(4)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded p-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className="break-words text-lg font-mono text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>

          <VerticalCurveProfile
            rows={result.profileRows.map(r => ({ chainage: r.chainage, x: r.x, RL: r.rl, grade: r.grade }))}
            bvcChainage={result.bvcChainage}
            evcChainage={result.evcChainage}
            vpiChainage={parseFloat(vpiCh)}
            bvcRL={result.bvcRL}
            evcRL={result.evcRL}
            vpiRL={parseFloat(vpiRL)}
            g1={parseFloat(g1)}
            g2={parseFloat(g2)}
            isCrest={result.isCrest}
            peakPoint={result.chainagePeak === null || result.rlPeak === null ? null : { chainage: result.chainagePeak, RL: result.rlPeak }}
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs font-mono border-collapse">
              <caption className="pb-2 text-left text-[var(--text-muted)]">Elevations at horizontal chainages, including exact endpoints and any unique stationary point on the curve.</caption>
              <thead>
                <tr className="bg-[var(--bg-tertiary)]">
                  {['Chainage (m)', 'RL (m)', 'x from BVC (m)', 'Offset from incoming tangent (m)', 'Grade (%)', 'Point'].map((h) => (
                    <th scope="col" key={h} className="px-3 py-2 text-left text-[var(--text-muted)] font-medium border border-[var(--border-color)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row => (
                  <tr key={row.chainage} className="border border-[color-mix(in_srgb,var(--border-color)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)]">
                    <td className="px-3 py-1.5 text-[var(--text-primary)]">{fmtCh(row.chainage)}</td>
                    <td className="px-3 py-1.5 text-[var(--text-primary)] text-right">{row.rl.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)] text-right">{row.x.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)] text-right">{row.y.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)] text-right">{row.grade.toFixed(4)}</td>
                    <td className="px-3 py-1.5">
                      {row.isBVC && <span className="text-[var(--accent)] font-bold">BVC</span>}
                      {row.isEVC && <span className="text-[var(--accent)] font-bold">EVC</span>}
                      {row.isPeak && <span className="text-yellow-400"> HIGH POINT</span>}
                      {row.isSag && <span className="text-blue-400"> LOW POINT</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="text-xs break-words">
            <summary className="cursor-pointer text-[var(--text-muted)]">Show Computation Steps</summary>
            <ol className="mt-3 space-y-3 font-mono">{result.steps.map(step => <li key={step.description}>{step.description}: {step.value}<br /><span className="text-[var(--text-muted)]">{step.formula}</span></li>)}</ol>
          </details>
        </>
      )}
    </div>
  )
}
