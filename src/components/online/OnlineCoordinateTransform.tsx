'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getSupportedSystems, transformOnlineCoordinates, type TransformResult } from '@/lib/online/coordinates'
import { UNAVAILABLE_DATUM_GUIDANCE, type OnlineReference } from '@/lib/online/coordinateContract'

type Measurements = Record<'longitude' | 'latitude' | 'easting' | 'northing' | 'elevation', string>
const emptyMeasurements: Measurements = { longitude: '', latitude: '', easting: '', northing: '', elevation: '' }
const controlClass = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500'
const unitLabel = (units: OnlineReference['units']) => units === 'metres' ? 'm' : units

function ReferenceSummary({ reference, title }: { reference: OnlineReference; title: string }) {
  return (
    <section aria-label={title} className="mt-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-sm">
      <h3 className="font-medium">{reference.code} — {reference.name}</h3>
      <p className="mt-1 text-[var(--text-muted)]">
        {reference.projected ? 'Projected' : 'Geographic'} · Datum: {reference.datum} · Units: {reference.units}
      </p>
      <p className="text-[var(--text-muted)]">Axis convention: {reference.axisConvention}</p>
    </section>
  )
}

function parseMeasurement(value: string): number | undefined {
  if (!value.trim()) return undefined
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error('Enter finite numeric measurements; partially numeric text is not accepted.')
  return number
}

function TransformationResult({ outcome }: { outcome: Extract<TransformResult, { success: true }> }) {
  const { result, target, operation } = outcome
  const digits = target.projected ? 3 : 6
  const pair = target.projected ? ['easting', 'northing'] as const : ['longitude', 'latitude'] as const
  return (
    <section aria-label="Transformation result" className="mt-6 space-y-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <h3 className="font-semibold text-green-700 dark:text-green-400">Transformation successful</h3>
      <ReferenceSummary reference={target} title="Result target reference" />
      <dl className="space-y-1 font-mono text-sm">
        {pair.map(key => {
          const value = result[key]
          return value !== undefined && <div key={key}><dt className="inline">{key[0].toUpperCase() + key.slice(1)}: </dt><dd className="inline">{value.toFixed(digits)} {unitLabel(target.units)}</dd></div>
        })}
        {result.elevation !== undefined && (
          <div><dt className="inline">Elevation: </dt><dd className="inline">{result.elevation === null ? 'not supplied (null)' : result.elevation} (unchanged)</dd></div>
        )}
      </dl>
      <p className="text-sm text-[var(--text-muted)]">Display resolution: {digits} decimal places for horizontal coordinates. This does not establish measurement accuracy.</p>
      <div className="space-y-1 text-sm">
        <p>Source: {outcome.source.code} — {outcome.source.name}</p>
        <p>Operation: {operation.kind} · Engine: {operation.engine} through {operation.authority}</p>
        <p>Accuracy: unknown (not established). Applicability: not verified.</p>
        <p>Horizontal transformation only. Elevation is preserved unchanged; no vertical datum transformation is performed.</p>
        <ul className="list-disc space-y-1 pl-5">
          {Array.from(new Set([...operation.notes, ...outcome.notes])).map(note => <li key={note}>{note}</li>)}
        </ul>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Configured operation definitions</summary>
        <p className="mt-2 font-medium">Source definition</p>
        <pre className="whitespace-pre-wrap break-all text-xs">{operation.sourceDefinition}</pre>
        <p className="mt-2 font-medium">Target definition</p>
        <pre className="whitespace-pre-wrap break-all text-xs">{operation.targetDefinition}</pre>
      </details>
    </section>
  )
}

export default function OnlineCoordinateTransform() {
  const id = useId()
  const [references] = useState(getSupportedSystems)
  const [fromCRS, setFromCRS] = useState('EPSG:4326')
  const [toCRS, setToCRS] = useState('')
  const [measurements, setMeasurements] = useState<Measurements>(emptyMeasurements)
  const [outcome, setOutcome] = useState<TransformResult | null>(null)
  const [pendingRevision, setPendingRevision] = useState<number | null>(null)
  const revision = useRef(0)
  // Input revisions invalidate output. The independent owner keeps a stale
  // request locked until settlement, and lets only that request release it.
  const pendingOwner = useRef<symbol | null>(null)
  const mounted = useRef(false)
  const source = references.find(reference => reference.code === fromCRS)
  const target = references.find(reference => reference.code === toCRS)
  const pending = pendingRevision !== null

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      revision.current += 1
      pendingOwner.current = null
    }
  }, [])

  function invalidate() {
    revision.current += 1
    setOutcome(null)
  }
  function editMeasurement(key: keyof Measurements, value: string) {
    invalidate()
    setMeasurements(current => ({ ...current, [key]: value }))
  }
  function editSource(code: string) {
    invalidate()
    const next = references.find(reference => reference.code === code)
    if (next?.projected !== source?.projected) {
      setMeasurements(current => ({ ...emptyMeasurements, elevation: current.elevation }))
    }
    setFromCRS(code)
  }
  function editTarget(code: string) {
    invalidate()
    setToCRS(code)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingOwner.current || !mounted.current) return
    setOutcome(null)
    if (!source || !target) {
      setOutcome({ success: false, code: 'CRS_REQUIRED', error: 'Choose both registered source and target references.' })
      return
    }
    const pair = source.projected ? ['easting', 'northing'] as const : ['longitude', 'latitude'] as const
    let request: Record<string, unknown>
    try {
      const first = parseMeasurement(measurements[pair[0]])
      const second = parseMeasurement(measurements[pair[1]])
      const elevation = parseMeasurement(measurements.elevation)
      if (first === undefined || second === undefined) throw new Error(`Enter finite ${pair[0]} and ${pair[1]} measurements; blank values are not zero.`)
      request = { fromCRS, toCRS, [pair[0]]: first, [pair[1]]: second, ...(elevation !== undefined ? { elevation } : {}) }
    } catch (error) {
      setOutcome({ success: false, code: 'INVALID_COORDINATE', error: error instanceof Error ? error.message : 'Enter finite numeric measurements.' })
      return
    }
    const requestRevision = revision.current
    const owner = Symbol('online-coordinate-request')
    pendingOwner.current = owner
    setPendingRevision(requestRevision)
    const isCurrent = () => mounted.current && pendingOwner.current === owner && revision.current === requestRevision
    try {
      const result = await transformOnlineCoordinates(request)
      if (isCurrent()) setOutcome(result)
    } catch {
      if (isCurrent()) setOutcome({ success: false, code: 'TRANSFORM_FAILED', error: 'The horizontal transformation could not be completed. No result was produced; try again.' })
    } finally {
      if (pendingOwner.current === owner) {
        pendingOwner.current = null
        if (mounted.current) setPendingRevision(null)
      }
    }
  }

  const pair = source?.projected ? ['easting', 'northing'] as const : ['longitude', 'latitude'] as const
  const status = pending
    ? pendingRevision === revision.current ? 'Transforming coordinates… You can edit the inputs.' : 'Inputs changed. The pending result will be discarded. Wait for settlement to calculate again.'
    : !target ? 'Choose a target CRS before calculating. No target grid is inferred.'
      : outcome?.success === false ? 'Calculation failed. Review the error before trying again.'
        : outcome?.success ? 'The result belongs to the current inputs.' : 'Ready to calculate with the selected references.'

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
      <h2 className="mb-2 text-xl font-semibold">Coordinate Transformation</h2>
      <p className="mb-5 text-sm text-[var(--text-muted)]">Name both horizontal references. Coordinates use longitude/easting first; no zone or hemisphere is inferred.</p>
      <form aria-label="Coordinate transformation" onSubmit={submit} noValidate>
        <div className="grid gap-6 md:grid-cols-2">
          {(['source', 'target'] as const).map(side => {
            const reference = side === 'source' ? source : target
            return <div key={side}>
              <label htmlFor={`${id}-${side}`} className="mb-1 block text-sm font-medium">{side === 'source' ? 'Source CRS' : 'Target CRS'}</label>
              <select id={`${id}-${side}`} className={controlClass} value={side === 'source' ? fromCRS : toCRS}
                onChange={event => side === 'source' ? editSource(event.target.value) : editTarget(event.target.value)}>
                <option value="">Choose {side} CRS</option>
                {references.map(reference => <option key={reference.code} value={reference.code}>
                  {reference.code} — {reference.name} · {reference.datum} · {reference.units} · {reference.projected ? 'projected' : 'geographic'}
                </option>)}
              </select>
              {reference && <ReferenceSummary reference={reference} title={side === 'source' ? 'Source reference' : 'Target reference'} />}
            </div>
          })}
        </div>
        {[source, target].some(reference => reference?.datum === 'Arc 1960') && (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Arc 1960 uses existing configured translation parameters. Regional applicability is not verified; check independent control before survey use.</p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {pair.map(key => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="mb-1 block text-sm font-medium capitalize">{key[0].toUpperCase() + key.slice(1)} ({unitLabel(source?.units ?? 'degrees')})</label>
              <input id={`${id}-${key}`} inputMode="decimal" type="text" autoComplete="off" className={controlClass} value={measurements[key]} onChange={event => editMeasurement(key, event.target.value)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-elevation`} className="mb-1 block text-sm font-medium">Elevation (optional, unchanged)</label>
            <input id={`${id}-elevation`} inputMode="decimal" type="text" autoComplete="off" aria-describedby={`${id}-height-help`} className={controlClass} value={measurements.elevation} onChange={event => editMeasurement('elevation', event.target.value)} />
            <p id={`${id}-height-help`} className="mt-1 text-sm text-[var(--text-muted)]">Accompanying measurement only. Its value and units remain as supplied; no vertical datum transformation is performed. Leave blank if unknown.</p>
          </div>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 text-sm text-[var(--text-muted)]">{status}</p>
        <button type="submit" disabled={pending || !source || !target} className="mt-3 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50">
          {pending ? 'Transforming…' : 'Transform Coordinates'}
        </button>
      </form>
      {outcome?.success === false && <p role="alert" aria-atomic="true" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">{outcome.code}: {outcome.error}</p>}
      {outcome?.success && <TransformationResult outcome={outcome} />}
      <p className="mt-5 text-sm text-[var(--text-muted)]">{UNAVAILABLE_DATUM_GUIDANCE}</p>
    </div>
  )
}
