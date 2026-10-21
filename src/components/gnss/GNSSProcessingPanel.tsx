'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Satellite } from 'lucide-react'
import { processRINEXBaseline, type RINEXBaselineResponse } from '@/lib/gnss/baselineClient'

interface GNSSProcessingPanelProps {
  onPositionComputed?: (position: {
    lat: number
    lon: number
    ellipsoidalHeight: number
    stdE: number
    stdN: number
    stdH: number
    quality: string
    ratio: number
    satellites: number
  }) => void
}

type FileSlot = 'base' | 'rover' | 'navigation'

const FILE_ACCEPT = '.obs,.rnx,.nav,.o,.d,.n,.g,.p'

export default function GNSSProcessingPanel({ onPositionComputed }: GNSSProcessingPanelProps) {
  const [files, setFiles] = useState<Record<FileSlot, File | null>>({ base: null, rover: null, navigation: null })
  const [baseCoordinates, setBaseCoordinates] = useState({ latitude: '', longitude: '', ellipsoidalHeight: '' })
  const [mode, setMode] = useState<'static' | 'kinematic'>('static')
  const [frequency, setFrequency] = useState<'l1' | 'l1+l2' | 'l1+l2+l5'>('l1+l2')
  const [elevationMask, setElevationMask] = useState(15)
  const [ambiguityResolution, setAmbiguityResolution] = useState<'off' | 'continuous' | 'instantaneous' | 'fix-and-hold'>('continuous')
  const [result, setResult] = useState<RINEXBaselineResponse | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [inputsChanged, setInputsChanged] = useState(false)
  const inputRevision = useRef(0)
  const mounted = useRef(true)
  const pending = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; inputRevision.current += 1 }
  }, [])

  const updateInputs = (update: () => void) => {
    inputRevision.current += 1
    if (pending.current || result) setInputsChanged(true)
    setResult(null)
    setError('')
    update()
  }

  const updateFile = (slot: FileSlot, file?: File) => {
    updateInputs(() => setFiles(current => ({ ...current, [slot]: file ?? null })))
  }

  const updateBaseCoordinate = (field: keyof typeof baseCoordinates, value: string) => {
    updateInputs(() => setBaseCoordinates(current => ({ ...current, [field]: value })))
  }

  const handleProcess = async () => {
    if (pending.current) return
    if (!files.base || !files.rover || !files.navigation) {
      setError('Choose base, rover, and navigation RINEX files before processing.')
      return
    }
    if ([baseCoordinates.latitude, baseCoordinates.longitude, baseCoordinates.ellipsoidalHeight].some(value => !value.trim())) {
      setError('Enter the known base-control latitude, longitude, and ellipsoidal height.')
      return
    }
    const basePosition = {
      latitude: Number(baseCoordinates.latitude),
      longitude: Number(baseCoordinates.longitude),
      ellipsoidalHeight: Number(baseCoordinates.ellipsoidalHeight),
    }
    if (!Number.isFinite(basePosition.latitude) || Math.abs(basePosition.latitude) > 90
      || !Number.isFinite(basePosition.longitude) || Math.abs(basePosition.longitude) > 180
      || !Number.isFinite(basePosition.ellipsoidalHeight)
      || basePosition.ellipsoidalHeight < -12000 || basePosition.ellipsoidalHeight > 100000) {
      setError('Check the base-control coordinate ranges and ellipsoidal height.')
      return
    }
    const revision = inputRevision.current
    pending.current = true
    setProcessing(true)
    setInputsChanged(false)
    setError('')
    setResult(null)
    try {
      const response = await processRINEXBaseline(
        { base: files.base, rover: files.rover, navigation: files.navigation },
        { mode, frequency, elevationMask, ambiguityResolution },
        basePosition,
      )
      if (!mounted.current || revision !== inputRevision.current) return
      setResult(response)
      onPositionComputed?.({
        lat: response.baseline.rover_latitude,
        lon: response.baseline.rover_longitude,
        ellipsoidalHeight: response.baseline.rover_height,
        stdE: response.baseline.sigma_east,
        stdN: response.baseline.sigma_north,
        stdH: response.baseline.sigma_up,
        quality: response.baseline.quality,
        ratio: response.baseline.ratio,
        satellites: response.baseline.sat_count,
      })
    } catch (cause) {
      if (mounted.current && revision === inputRevision.current) {
        setError(cause instanceof Error ? cause.message : 'GNSS baseline processing failed.')
      }
    } finally {
      pending.current = false
      if (mounted.current) setProcessing(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
  const fileInput = (slot: FileSlot, label: string, description: string) => (
    <div className="min-w-0 space-y-2">
      <label htmlFor={`gnss-${slot}`} className="block text-sm font-medium text-[var(--text-primary)]">{label}</label>
      <p className="text-xs leading-5 text-[var(--text-muted)]">{description}</p>
      <input
        id={`gnss-${slot}`}
        type="file"
        accept={FILE_ACCEPT}
        onChange={event => updateFile(slot, event.target.files?.[0])}
        className={inputClass}
      />
      {files[slot] && (
        <p className="break-all text-xs text-[var(--text-secondary)]">
          {files[slot]?.name} · {((files[slot]?.size ?? 0) / 1024 / 1024).toFixed(2)} MB
        </p>
      )}
    </div>
  )

  const baseline = result?.baseline

  return (
    <section className="mx-auto max-w-5xl space-y-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-[var(--text-primary)] sm:p-6" aria-labelledby="gnss-baseline-title">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">RTKLIB baseline processing</p>
        <h2 id="gnss-baseline-title" className="text-2xl font-semibold tracking-tight">Process a GNSS baseline</h2>
        <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          Submit paired base and rover RINEX observations with a navigation file. METARDU sends them to the configured RTKLIB worker and displays only the measurements it returns. The result is geographic latitude/longitude and ellipsoidal height; no project-grid transformation or orthometric-height conversion is applied here.
        </p>
      </header>

      <div role="note" className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-sm leading-5 text-amber-100">
        The selected RINEX files are sent to METARDU&apos;s configured compute worker. Enter the known base-control coordinates below; the approximate RINEX header position is not used as the control. RTKLIB returns geographic coordinates and ellipsoidal height without datum or epoch transformation. Confirm the reference frame, both antenna setups/heights in the RINEX metadata, epoch overlap, and processing suitability before using a result for control or construction.
      </div>

      <section className="space-y-3 rounded-lg border border-[var(--border-color)] p-4" aria-label="Known base control coordinates">
        <div>
          <h3 className="text-sm font-semibold">Known base-control coordinates</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Enter surveyed base coordinates in WGS 84-compatible geographic latitude/longitude and ellipsoidal height. Convert other datums or coordinate epochs before processing; this tool does not transform projected grids or reference frames.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="gnss-base-latitude" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Latitude (degrees)</label>
            <input id="gnss-base-latitude" type="number" min="-90" max="90" step="any" inputMode="decimal" value={baseCoordinates.latitude} onChange={event => updateBaseCoordinate('latitude', event.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="gnss-base-longitude" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Longitude (degrees)</label>
            <input id="gnss-base-longitude" type="number" min="-180" max="180" step="any" inputMode="decimal" value={baseCoordinates.longitude} onChange={event => updateBaseCoordinate('longitude', event.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="gnss-base-height" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Ellipsoidal height (m)</label>
            <input id="gnss-base-height" type="number" min="-12000" max="100000" step="any" inputMode="decimal" value={baseCoordinates.ellipsoidalHeight} onChange={event => updateBaseCoordinate('ellipsoidalHeight', event.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 rounded-lg border border-[var(--border-color)] p-4 md:grid-cols-3" aria-label="RINEX input files">
        {fileInput('base', 'Base observation file', 'RINEX observation data from the known reference receiver.')}
        {fileInput('rover', 'Rover observation file', 'RINEX observation data collected at the point to determine.')}
        {fileInput('navigation', 'Navigation file', 'RINEX broadcast navigation data used by RTKLIB.')}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="RTKLIB processing settings">
        <div>
          <label htmlFor="gnss-mode" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Positioning mode</label>
          <select id="gnss-mode" value={mode} onChange={event => updateInputs(() => setMode(event.target.value as typeof mode))} className={inputClass}>
            <option value="static">Static</option>
            <option value="kinematic">Kinematic</option>
          </select>
        </div>
        <div>
          <label htmlFor="gnss-frequency" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Frequency</label>
          <select id="gnss-frequency" value={frequency} onChange={event => updateInputs(() => setFrequency(event.target.value as typeof frequency))} className={inputClass}>
            <option value="l1">L1</option>
            <option value="l1+l2">L1 + L2</option>
            <option value="l1+l2+l5">L1 + L2 + L5</option>
          </select>
        </div>
        <div>
          <label htmlFor="gnss-elevation-mask" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Elevation mask (degrees)</label>
          <input id="gnss-elevation-mask" type="number" min="0" max="90" step="1" value={elevationMask} onChange={event => updateInputs(() => setElevationMask(Math.max(0, Math.min(90, Number(event.target.value)))))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="gnss-ambiguity-resolution" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Ambiguity resolution</label>
          <select id="gnss-ambiguity-resolution" value={ambiguityResolution} onChange={event => updateInputs(() => setAmbiguityResolution(event.target.value as typeof ambiguityResolution))} className={inputClass}>
            <option value="continuous">Continuous</option>
            <option value="instantaneous">Instantaneous</option>
            <option value="fix-and-hold">Fix and hold</option>
            <option value="off">Off (float solution)</option>
          </select>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
      {inputsChanged && <p role="status" className="text-sm text-[var(--text-secondary)]">{processing
        ? 'Inputs changed. The submitted run is still finishing; its result will be discarded. Process the current inputs after it finishes.'
        : 'Inputs changed. Process again to obtain a result for the current files, control and settings.'}</p>}

      <button
        type="button"
        onClick={() => void handleProcess()}
        disabled={processing || !files.base || !files.rover || !files.navigation || [baseCoordinates.latitude, baseCoordinates.longitude, baseCoordinates.ellipsoidalHeight].some(value => !value.trim())}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[var(--accent-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing RINEX…</> : <><Satellite className="h-4 w-4" /> Process baseline</>}
      </button>
      {processing && !inputsChanged && <p role="status" className="text-sm text-[var(--text-muted)]">The RTKLIB worker may take several minutes on long observation sessions.</p>}

      {baseline && result && (
        <section className="space-y-4 rounded-lg border border-emerald-700/60 bg-emerald-950/15 p-4" aria-labelledby="gnss-baseline-result">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="gnss-baseline-result" className="text-lg font-semibold">Worker result</h3>
              <p className="text-xs text-[var(--text-muted)]">{result.meta.processedBy} · {new Date(result.meta.processedAt).toLocaleString()}</p>
            </div>
            <span className="rounded-md border border-[var(--border-color)] px-3 py-1 text-sm font-semibold">{baseline.quality || 'Quality not reported'}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Rover latitude</dt><dd className="mt-1 font-mono text-sm tabular-nums">{baseline.rover_latitude.toFixed(8)}°</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Rover longitude</dt><dd className="mt-1 font-mono text-sm tabular-nums">{baseline.rover_longitude.toFixed(8)}°</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Rover height (ellipsoidal)</dt><dd className="mt-1 font-mono text-sm tabular-nums">{baseline.rover_height.toFixed(4)} m</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Satellites reported</dt><dd className="mt-1 font-mono text-sm tabular-nums">{baseline.sat_count}</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Reported σE / σN / σU</dt><dd className="mt-1 font-mono text-sm tabular-nums">{baseline.sigma_east.toFixed(4)} / {baseline.sigma_north.toFixed(4)} / {baseline.sigma_up.toFixed(4)} m</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Ambiguity ratio</dt><dd className="mt-1 font-mono text-sm tabular-nums">{Number.isFinite(baseline.ratio) && baseline.ratio > 0 ? baseline.ratio.toFixed(2) : 'Not reported'}</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Settings used</dt><dd className="mt-1 text-sm">{result.meta.mode}, {result.meta.frequency}, {result.meta.ambiguityResolution}, {result.meta.elevationMask}° mask</dd></div>
            <div className="rounded-md bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">Base reference entered</dt><dd className="mt-1 font-mono text-xs tabular-nums">{result.meta.basePosition.latitude.toFixed(8)}°, {result.meta.basePosition.longitude.toFixed(8)}°, {result.meta.basePosition.ellipsoidalHeight.toFixed(4)} m ellipsoidal</dd></div>
          </dl>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">RTKLIB&apos;s status and reported uncertainties are shown as returned. Confirm control, reference frame, antenna heights, quality thresholds, and project CRS independently; no local easting/northing values are inferred.</p>
        </section>
      )}
    </section>
  )
}
