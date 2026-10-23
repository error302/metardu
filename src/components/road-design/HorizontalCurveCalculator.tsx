'use client'

import { useState } from 'react'
import { curveSetOut, horizontalCurveElements, type HorizontalCurveInput, type HorizontalCurveResult, type SetOutResult } from '@/lib/computations/roadDesignEngine'
import { SimpleCurveDiagram } from '@/components/tools/SimpleCurveDiagram'
import { horizontalCurveDraftDxf, type LocalCurveDirection } from '@/lib/engineering/roadQuickComputeDxf'
import { RoadDxfExportButton } from './RoadDxfExportButton'

type Tab = 'elements' | 'setout'
type Fields = { radius: string; degrees: string; minutes: string; seconds: string; ip: string; interval: string }
type Computation = { input: HorizontalCurveInput; interval: number; elements: HorizontalCurveResult; setout: SetOutResult }
const fields: { key: keyof Fields; label: string; min?: string; max?: string; step: string }[] = [
  { key: 'radius', label: 'Radius R (m)', min: '0', step: 'any' },
  { key: 'degrees', label: 'Δ Degrees', min: '0', max: '179', step: '1' },
  { key: 'minutes', label: 'Δ Minutes', min: '0', max: '59', step: '1' },
  { key: 'seconds', label: 'Δ Seconds', min: '0', max: '59.999999999', step: 'any' },
  { key: 'ip', label: 'IP Chainage (m)', step: 'any' },
  { key: 'interval', label: 'Peg Interval (m)', min: '0', step: 'any' },
]

function readNumber(value: string, label: string) {
  const trimmed = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed) || !Number.isFinite(Number(trimmed))) {
    throw new Error(`${label} requires a finite number.`)
  }
  return Number(trimmed)
}

export default function HorizontalCurveCalculator() {
  const [tab, setTab] = useState<Tab>('elements')
  const [values, setValues] = useState<Fields>({ radius: '', degrees: '', minutes: '0', seconds: '0', ip: '', interval: '20' })
  const [computed, setComputed] = useState<Computation | null>(null)
  const [error, setError] = useState('')
  const [direction, setDirection] = useState<LocalCurveDirection | ''>('')

  function update(key: keyof Fields, value: string) {
    setValues(previous => ({ ...previous, [key]: value }))
    setComputed(null)
    setError('')
  }
  function compute() {
    setComputed(null)
    setError('')
    try {
      const numbers = Object.fromEntries(fields.map(field => [field.key, readNumber(values[field.key], field.label)])) as Record<keyof Fields, number>
      const input: HorizontalCurveInput = {
        radius: numbers.radius, deflectionAngleDeg: numbers.degrees, deflectionAngleMin: numbers.minutes,
        deflectionAngleSec: numbers.seconds, ipChainage: numbers.ip,
      }
      const elements = horizontalCurveElements(input)
      const setout = curveSetOut({ ...input, tcChainage: elements.tcChainage, ctChainage: elements.ctChainage, interval: numbers.interval })
      if (!elements.arithmeticCheck.passed || !setout.arithmeticCheck.passed) throw new Error('Numerical consistency check failed; review the inputs.')
      setComputed({ input, interval: numbers.interval, elements, setout })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to calculate this curve.')
    }
  }
  const result = computed?.elements

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex gap-2 border-b border-[var(--border-color)] pb-3">
        {([['elements', 'Curve Elements'], ['setout', 'Set-Out Table']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-t text-sm font-medium ${tab === id ? 'bg-[var(--accent)] text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{label}</button>
        ))}
      </div>
      <p className="text-sm text-[var(--text-muted)]">Enter the design radius, central angle and PI (IP) chainage. Stationing follows the arc from TC (PC) to CT (PT); intervals are in metres.</p>
      <form noValidate onSubmit={event => { event.preventDefault(); compute() }} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {fields.map(field => (
            <div key={field.key} className="min-w-0">
              <label className="block text-xs text-[var(--text-muted)] mb-1" htmlFor={`curve-${field.key}`}>{field.label}</label>
              <input id={`curve-${field.key}`} value={values[field.key]} onChange={event => update(field.key, event.target.value)} type="number" min={field.min} max={field.max} step={field.step}
                className="w-full min-w-0 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="px-5 py-2 bg-[var(--accent)] text-black rounded text-sm font-medium hover:opacity-90">Compute</button>
          {computed && <span role="status" className="text-xs text-[var(--text-muted)]">Numerical identities consistent · field checks still required</span>}
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {!computed && !error && <p className="text-sm text-[var(--text-muted)]">Enter or update the inputs, then compute to show current results.</p>}
      <div className="min-w-0 space-y-2">
        <label htmlFor="curve-direction" className="block text-xs text-[var(--text-muted)]">Curve Direction (local DXF)</label>
        <select id="curve-direction" value={direction} onChange={event => { setDirection(event.target.value as LocalCurveDirection | ''); setComputed(null); setError('') }} className="max-w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm">
          <option value="">Choose direction for export</option><option value="left">Left</option><option value="right">Right</option>
        </select>
        <p className="text-xs text-[var(--text-muted)]">The DXF uses TC at (0,0), the incoming tangent along +X and metre units. It has no project CRS, bearing or surveyed placement. Set-out deflections above are magnitudes.</p>
      </div>
      {computed && <RoadDxfExportButton disabled={!direction} filename="horizontal-curve-local-draft.dxf" createDxf={() => horizontalCurveDraftDxf(computed.input, computed.interval, direction as LocalCurveDirection)} />}
      {tab === 'elements' && result && computed && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Tangent Length (T)', `${result.tangentLength.toFixed(4)} m`],
              ['Curve Length (L)', `${result.curveLength.toFixed(4)} m`],
              ['Long Chord (C)', `${result.longChord.toFixed(4)} m`],
              ['Mid Ordinate (M)', `${result.midOrdinate.toFixed(4)} m`],
              ['External Dist (E)', `${result.externalDistance.toFixed(4)} m`],
              ['Degree of Curve (30 m arc)', `${result.degreeOfCurve.toFixed(4)}°`],
              ['TC Chainage (m)', result.tcChainage.toFixed(3)],
              ['CC Chainage (m)', result.ccChainage.toFixed(3)],
              ['CT Chainage (m)', result.ctChainage.toFixed(3)],
              ['Δ (radians)', result.delta.toFixed(8)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded p-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
                <p className="break-words text-lg font-mono text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
          </div>
          <SimpleCurveDiagram radius={computed.input.radius} deflectionDeg={result.delta * 180 / Math.PI}
            tangentLength={result.tangentLength} arcLength={result.curveLength} longChord={result.longChord}
            externalDistance={result.externalDistance} midOrdinate={result.midOrdinate}
            pcChainage={result.tcChainage} piChainage={computed.input.ipChainage} ptChainage={result.ctChainage} />
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-muted)]">Show Computation Steps</summary>
            <ol className="mt-3 space-y-3 break-words font-mono">
              {result.steps.map(step => <li key={step.description}>{step.description}: {step.value}<br /><span className="text-[var(--text-muted)]">{step.formula}</span></li>)}
            </ol>
          </details>
        </>
      )}
      {tab === 'setout' && computed && <SetOutDisplay result={computed.setout} />}
    </div>
  )
}

function SetOutDisplay({ result }: { result: SetOutResult }) {
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm text-[var(--text-muted)]">Chords join consecutive pegs. Cumulative deflections are magnitudes from the forward tangent at TC; apply the declared curve direction in the field. This table supplies no coordinates, bearings or control verification.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs font-mono border-collapse">
          <caption className="pb-2 text-left text-[var(--text-muted)]">Arc chainages (m) · deflections in degrees, minutes and seconds</caption>
          <thead><tr className="bg-[var(--bg-tertiary)]">
            {['Peg', 'Chainage (m)', 'Chord from previous peg (m)', 'Incremental deflection', 'Cumulative from TC tangent', 'Remarks'].map(heading => (
              <th scope="col" key={heading} className="px-3 py-2 text-left text-[var(--text-muted)] font-medium border border-[var(--border-color)]">{heading}</th>
            ))}
          </tr></thead>
          <tbody>{result.rows.map(row => (
            <tr key={row.peg} className="border border-[var(--border-color)]">
              <th scope="row" className="px-3 py-2 text-left font-normal">{row.peg}</th>
              <td className="px-3 py-2">{row.chainage.toFixed(3)}</td>
              <td className="px-3 py-2 text-right">{row.peg === 'TC' ? '—' : row.chord.toFixed(3)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.deflectionAngle}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.totalDeflection}</td>
              <td className="px-3 py-2">{row.remarks}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-muted)]">Sum of successive chords: {result.totalChord.toFixed(3)} m. CT deflection: {result.checkTotalDeflection}. These are mathematical checks, not field acceptance.</p>
    </div>
  )
}
