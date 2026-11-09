'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import Link from 'next/link'
import { readReferenceResponse } from '@/lib/spatial/referenceDeclaration'
import { validateCoordinateRange } from '@/lib/spatial/projectCrs'
import {
  evaluateZoneStatus, parseGeofenceBoundary, playGeofenceAlert,
  type GeofenceStatus, type HazardZone, type Point,
} from '@/lib/survey/geofenceEngine'
import { geofenceGpsFix, GEOFENCE_FIX_MAX_AGE_MS, supportsGeofenceGps, type GeofenceFix } from '@/lib/survey/geofencePosition'

const exampleBoundary = '250000, 9945000\n250150, 9945000\n250150, 9945120\n250000, 9945120'
const exampleHazards: HazardZone[] = [
  { center: { easting: 250110, northing: 9945060 }, radius: 20, type: 'Example riverbank exclusion' },
]
const statusLabels: Record<GeofenceStatus, string> = {
  INSIDE_SAFE: 'Inside perimeter, clear of configured alerts',
  BOUNDARY_WARNING: 'Near the perimeter',
  OUTSIDE_BREACH: 'Outside perimeter',
  HAZARD_PROXIMITY: 'Inside an exclusion zone',
  POSITION_UNCERTAIN: 'Position uncertain near an alert zone',
  UNKNOWN: 'Awaiting a position',
}

const panel = 'rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 sm:p-5 space-y-3'
const field = 'w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 text-sm'
const button = 'inline-flex min-h-10 items-center rounded-lg border border-[var(--border-color)] px-3 text-sm font-medium hover:bg-[var(--bg-tertiary)] disabled:opacity-50'

interface Incident {
  timestamp: string
  status: GeofenceStatus
  point: Point
  distance: number
  hazard?: string
  source: 'simulation' | 'device'
  accuracy?: number
  buffer: number
}

function decimalField(form: FormData, name: string): number {
  const text = String(form.get(name) ?? '').trim()
  const value = text === '' ? NaN : Number(text)
  if (!Number.isFinite(value) || Math.abs(value) > 1e8) throw new Error('Enter valid metre values in all coordinate fields.')
  return value
}

function isPointInGrid(point: Point, crs?: string) {
  return !crs || validateCoordinateRange(point.easting, point.northing, crs).valid
}

function incidentCsvValue(value: string | number | undefined): string {
  const text = String(value ?? '')
  const safe = typeof value === 'string' && /^\s*[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

export default function GeofenceMonitor({ projectId }: { projectId?: string }) {
  const radarBoundaryId = useId()
  const [reference, setReference] = useState<ReturnType<typeof readReferenceResponse>['referenceSystem']>(null)
  const [referenceMessage, setReferenceMessage] = useState('Checking project access and reference system…')
  const crs = reference?.prs.horizontalCrs
  const gpsSupported = Boolean(crs && supportsGeofenceGps(crs) && !reference?.calibrationVersion && !reference?.calibrationNotes)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    const referenceUrl = '/api/project/' + encodeURIComponent(projectId) + '/reference-system'
    async function loadReference() {
      try {
        const response = await fetch(referenceUrl, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('The project reference is unavailable. Check your access and sign-in.')
        const { referenceSystem } = readReferenceResponse(await response.json() as unknown)
        if (controller.signal.aborted) return
        setReference(referenceSystem)
        if (!referenceSystem) setReferenceMessage('Declare a projected metre reference system in the project before using its geofence.')
      } catch (error) {
        if (!controller.signal.aborted) setReferenceMessage(error instanceof Error ? error.message : 'The project reference could not be loaded.')
      }
    }
    void loadReference()
    return () => controller.abort()
  }, [projectId])

  const [boundaryText, setBoundaryText] = useState(projectId ? '' : exampleBoundary)
  const [bufferText, setBufferText] = useState('10')
  const [boundary, setBoundary] = useState<Point[]>(() => projectId ? [] : parseGeofenceBoundary(exampleBoundary))
  const [bufferDistance, setBufferDistance] = useState(10)
  const [hazards, setHazards] = useState<HazardZone[]>(projectId ? [] : exampleHazards)
  const [setupError, setSetupError] = useState('')
  const [hazardError, setHazardError] = useState('')
  const [positionError, setPositionError] = useState('')
  const [setupDirty, setSetupDirty] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [simulated, setSimulated] = useState<Point | null>(null)
  const [tracking, setTracking] = useState(false)
  const [fix, setFix] = useState<GeofenceFix | null>(null)
  const [fixMessage, setFixMessage] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioMessage, setAudioMessage] = useState('')
  const [hapticEnabled, setHapticEnabled] = useState(false)
  const [hapticMessage, setHapticMessage] = useState('')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const lastTransition = useRef('')
  const lastFixTime = useRef(0)

  useEffect(() => {
    if (!tracking || !crs) return
    const projectGrid = crs
    const geolocation = navigator.geolocation
    if (!geolocation) {
      setFixMessage('Device location is unavailable in this browser.')
      setTracking(false)
      return
    }

    let stopWatch: (() => void) | undefined
    function updateVisibility() {
      stopWatch?.()
      setFix(null)
      if (document.visibilityState !== 'visible') {
        setFixMessage('Device monitoring paused while this tab is hidden.')
        return
      }

      setFixMessage('Waiting for a fresh device location…')
      let active = true
      let expiry: ReturnType<typeof setTimeout> | undefined
      const expireFix = (message: string) => {
        clearTimeout(expiry)
        setFix(null)
        setFixMessage(message)
      }
      const watchId = geolocation.watchPosition(position => {
        if (!active || document.visibilityState !== 'visible' || position.timestamp <= lastFixTime.current) return
        try {
          const next = geofenceGpsFix(position, projectGrid, Date.now())
          lastFixTime.current = next.timestamp
          clearTimeout(expiry)
          setFix(next)
          setFixMessage('')
          expiry = setTimeout(() => expireFix('Device location expired. Waiting for a fresh fix.'), next.timestamp + GEOFENCE_FIX_MAX_AGE_MS - Date.now())
        } catch (error) {
          expireFix(error instanceof Error ? error.message : 'Device location is unavailable.')
        }
      }, error => {
        if (!active) return
        expireFix(error.code === 1 ? 'Location permission denied. Allow location before starting again.' : 'Device location is unavailable. Waiting for a fresh fix.')
        if (error.code === 1) setTracking(false)
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 })

      stopWatch = () => {
        active = false
        clearTimeout(expiry)
        geolocation.clearWatch(watchId)
      }
    }
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility)
      stopWatch?.()
    }
  }, [tracking, crs])

  const point = tracking ? fix?.point : simulated
  const source: Incident['source'] = tracking ? 'device' : 'simulation'
  const status = point ? evaluateZoneStatus(point, { boundary, bufferDistance }, hazards, tracking ? fix?.gridAccuracy : 0) : null
  const statusCode = status?.status
  const distance = status?.distanceToBoundary
  const hazard = status?.hazard

  useEffect(() => {
    if (!point || !statusCode || statusCode === 'UNKNOWN' || statusCode === 'INSIDE_SAFE') {
      lastTransition.current = ''
      return
    }
    const transition = source + ':' + statusCode + ':' + (hazard ?? '')
    if (lastTransition.current === transition) return
    lastTransition.current = transition
    setIncidents(previous => [{
      timestamp: new Date(tracking && fix ? fix.timestamp : Date.now()).toISOString(),
      point, status: statusCode, distance: distance ?? 0, hazard, source,
      accuracy: tracking ? fix?.reportedAccuracy : undefined, buffer: bufferDistance,
    }, ...previous].slice(0, 200))
    if (!tracking || document.visibilityState !== 'visible') return
    const breach = statusCode === 'OUTSIDE_BREACH' || statusCode === 'HAZARD_PROXIMITY'
    if (audioEnabled) void playGeofenceAlert(breach ? 'breach' : 'warning').then(played => {
      if (!played) setAudioMessage('Audio could not play. Use Test & enable audio to retry.')
    })
    if (hapticEnabled && !navigator.vibrate(breach ? [300, 120, 300] : 200)) setHapticMessage('This browser could not vibrate.')
  }, [point, statusCode, distance, hazard, source, tracking, fix, bufferDistance, audioEnabled, hapticEnabled])

  function applyBoundary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const next = parseGeofenceBoundary(boundaryText)
      if (next.some(point => !isPointInGrid(point, crs))) throw new Error('One or more vertices are outside the declared grid coordinate range.')
      const buffer = decimalField(new FormData(event.currentTarget), 'buffer')
      if (buffer < 0 || buffer > 10_000) throw new Error('Enter a warning buffer between 0 and 10,000 m.')
      setBoundary(next)
      setBufferDistance(buffer)
      setSetupError('')
      setSetupDirty(false)
      setReviewed(false)
      setSimulated(null)
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'The boundary could not be applied.')
    }
  }

  function addHazard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const center = { easting: decimalField(form, 'easting'), northing: decimalField(form, 'northing') }
      if (!isPointInGrid(center, crs)) throw new Error('The exclusion centre is outside the declared grid coordinate range.')
      const radius = decimalField(form, 'radius')
      const type = String(form.get('name') ?? '').trim()
      if (!type || radius <= 0 || radius > 10_000) throw new Error('Enter a name and a radius greater than 0 and at most 10,000 m.')
      setHazards(previous => [...previous, { center, radius, type }])
      setHazardError('')
      setReviewed(false)
      setSimulated(null)
      event.currentTarget.reset()
    } catch (error) {
      setHazardError(error instanceof Error ? error.message : 'The exclusion could not be added.')
    }
  }

  function testPosition(next: Point) {
    if (!isPointInGrid(next, crs)) {
      setPositionError('Enter a position in the declared project grid.')
      return
    }
    setPositionError('')
    setFixMessage('')
    setSimulated(next)
  }

  function testTypedPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      testPosition({ easting: decimalField(form, 'easting'), northing: decimalField(form, 'northing') })
    } catch (error) {
      setPositionError(error instanceof Error ? error.message : 'The position could not be tested.')
    }
  }

  function testRadarPosition(event: MouseEvent<SVGSVGElement>) {
    if (tracking || !boundary.length || setupDirty) return
    const matrix = event.currentTarget.getScreenCTM()
    if (!matrix) return
    const cursor = event.currentTarget.createSVGPoint()
    cursor.x = event.clientX
    cursor.y = event.clientY
    const local = cursor.matrixTransform(matrix.inverse())
    testPosition({ easting: local.x, northing: -local.y })
  }

  function toggleTracking() {
    setSimulated(null)
    setFix(null)
    setFixMessage('')
    setPositionError('')
    lastFixTime.current = 0
    setTracking(!tracking)
  }

  function downloadLog() {
    const rows = incidents.slice().reverse().map(event => [
      event.timestamp, event.source, projectId, crs, event.status, event.point.easting.toFixed(2),
      event.point.northing.toFixed(2), event.distance.toFixed(2), event.buffer, event.accuracy, event.hazard,
    ].map(incidentCsvValue).join(','))
    const csv = 'UTC timestamp,Position source,Project ID,CRS,Status,Easting m,Northing m,Boundary distance m,Buffer m,Reported accuracy m,Exclusion name\r\n' + rows.join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'metardu-geofence-session.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (projectId && !reference) {
    return <section className={panel}><p role="status">{referenceMessage}</p><Link href={'/project/' + encodeURIComponent(projectId)} className={button}>Back to project</Link></section>
  }

  const extent = boundary.length ? [
    ...boundary,
    ...hazards.flatMap(({ center, radius }) => [
      { easting: center.easting - radius, northing: center.northing - radius },
      { easting: center.easting + radius, northing: center.northing + radius },
    ]),
  ] : [{ easting: 0, northing: 0 }, { easting: 100, northing: 100 }]
  const eastings = extent.map(point => point.easting)
  const northings = extent.map(point => point.northing)
  const minE = Math.min(...eastings)
  const maxN = Math.max(...northings)
  const width = Math.max(...eastings) - minE
  const height = maxN - Math.min(...northings)
  const pad = Math.max(width, height) / 5
  const marker = Math.max(width, height) / 75
  const polygonPoints = boundary.map(point => point.easting + ',' + (-point.northing)).join(' ')
  const offRadar = point && (
    point.easting < minE - pad || point.easting > minE + width + pad ||
    point.northing > maxN + pad || point.northing < maxN - height - pad
  )

  return (
    <div className="space-y-4">
      <section className={panel} aria-label="Monitoring mode">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{tracking ? 'Foreground device monitoring' : projectId ? 'Project simulation' : 'Standalone simulation'}</h2>
          {projectId && <Link href={'/project/' + encodeURIComponent(projectId)} className={button}>Back to project</Link>}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {projectId
            ? 'Project grid ' + crs + '. Enter the reviewed site perimeter and exclusions in this grid. Configuration and incident history belong to this browser session.'
            : 'Try the example layout or paste your own local metre coordinates. Open Site geofence from a project to use supported device positioning.'}
        </p>
        {projectId && <p className="text-sm text-[var(--text-secondary)]">Device positions and alerts are advisory. Keep the tab visible and use your site safety controls and verified plans.</p>}
        {projectId && !gpsSupported && <p className="text-sm text-amber-300">Device monitoring currently supports WGS 84 UTM projects without a declared local calibration. You can simulate in this project grid.</p>}
        {gpsSupported && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={reviewed} disabled={tracking || setupDirty || boundary.length === 0} onChange={event => setReviewed(event.target.checked)} />
              I checked that the applied perimeter and exclusions use the declared project grid.
            </label>
            <button type="button" className={button} disabled={!tracking && (!reviewed || setupDirty || boundary.length === 0)} onClick={toggleTracking}>
              {tracking ? 'Stop device monitoring' : 'Start device monitoring'}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} aria-pressed={audioEnabled} onClick={async () => {
                if (audioEnabled) { setAudioEnabled(false); setAudioMessage(''); return }
                const played = await playGeofenceAlert('warning')
                setAudioEnabled(played)
                setAudioMessage(played ? '' : 'Audio is unavailable or blocked by the browser.')
              }}>{audioEnabled ? 'Mute audio' : 'Test & enable audio'}</button>
              <button type="button" className={button} aria-pressed={hapticEnabled} onClick={() => {
                const enabled = !hapticEnabled && typeof navigator.vibrate === 'function' && navigator.vibrate(100)
                setHapticEnabled(enabled)
                setHapticMessage(!enabled && !hapticEnabled ? 'Haptics are unavailable or blocked by the browser.' : '')
              }}>{hapticEnabled ? 'Turn off haptics' : 'Test & enable haptics'}</button>
            </div>
            {(audioMessage || hapticMessage) && <p role="status" className="text-sm text-amber-300">{[audioMessage, hapticMessage].filter(Boolean).join(' ')}</p>}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className={panel} aria-labelledby="geofence-radar-heading">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 id="geofence-radar-heading" className="font-semibold">Site radar · Grid north up</h2>
            <p className="text-sm">Applied buffer {bufferDistance} m</p>
          </div>
          <div className={statusCode === 'OUTSIDE_BREACH' || statusCode === 'HAZARD_PROXIMITY' ? 'text-red-300' : statusCode === 'INSIDE_SAFE' ? 'text-emerald-300' : 'text-amber-300'}>
            <p role="status" className="font-semibold">{fixMessage || (statusCode ? statusLabels[statusCode] : 'Awaiting a position')}{hazard ? ' · ' + hazard : ''}</p>
            {point && <p className="text-xs">E {point.easting.toFixed(2)} m · N {point.northing.toFixed(2)} m · Perimeter distance {distance?.toFixed(1)} m{tracking && fix ? ' · Reported accuracy ±' + fix.reportedAccuracy.toFixed(1) + ' m' : ''}</p>}
          </div>
          <svg
            viewBox={[minE - pad, -maxN - pad, width + 2 * pad, height + 2 * pad].join(' ')}
            onClick={testRadarPosition}
            role="img"
            aria-label="Site perimeter and circular exclusion zones"
            className={'h-[clamp(15rem,48vh,28rem)] w-full rounded-xl border border-[var(--border-color)] bg-black/30 ' + (!tracking && boundary.length && !setupDirty ? 'cursor-crosshair' : '')}
          >
            <defs><clipPath id={radarBoundaryId}><polygon points={polygonPoints} /></clipPath></defs>
            <polygon points={polygonPoints} fill="#22c55e20" />
            {bufferDistance > 0 && <polygon points={polygonPoints} fill="none" stroke="#f59e0b60" strokeWidth={2 * bufferDistance} strokeLinejoin="round" clipPath={'url(#' + radarBoundaryId + ')'} />}
            <polygon points={polygonPoints} fill="none" stroke="#22c55e" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {hazards.map((zone, index) => (
              <circle key={index} cx={zone.center.easting} cy={-zone.center.northing} r={zone.radius} fill="#ef444435" stroke="#ef4444" strokeWidth={2} vectorEffect="non-scaling-stroke"><title>{zone.type}</title></circle>
            ))}
            {tracking && fix && <circle cx={fix.point.easting} cy={-fix.point.northing} r={fix.gridAccuracy} fill="#60a5fa30" stroke="#60a5fa" vectorEffect="non-scaling-stroke" />}
            {point && <circle cx={point.easting} cy={-point.northing} r={marker} fill="#60a5fa" stroke="white" vectorEffect="non-scaling-stroke" />}
          </svg>
          <p className="text-xs text-[var(--text-secondary)]">Green perimeter · Amber warning band · Red exclusions · Blue rover{tracking ? ' and estimated accuracy' : ' · Click the radar to simulate a position'}.{offRadar ? ' Rover is outside the radar view.' : ''}</p>
          {!tracking && (
            <form onSubmit={testTypedPosition} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-xs">Rover easting (m)<input name="easting" type="number" step="any" required className={field} /></label>
              <label className="text-xs">Rover northing (m)<input name="northing" type="number" step="any" required className={field} /></label>
              <button className={button} disabled={boundary.length === 0 || setupDirty}>Test position</button>
            </form>
          )}
          {positionError && <p role="alert" className="text-sm text-amber-300">{positionError}</p>}
        </section>

        <section className={panel} aria-labelledby="geofence-site-heading">
          <h2 id="geofence-site-heading" className="font-semibold">Site setup</h2>
          <form onSubmit={applyBoundary}>
            <fieldset disabled={tracking} className="space-y-2">
              <label className="block text-sm">Boundary vertices · easting, northing
                <textarea rows={5} maxLength={32_000} value={boundaryText} onChange={event => {
                  setBoundaryText(event.target.value); setSetupDirty(true); setSimulated(null); setReviewed(false)
                }} className={field + ' font-mono'} />
              </label>
              <p className="text-xs text-[var(--text-secondary)]">One pair per line in perimeter order. The last vertex connects to the first.</p>
              <label className="block text-sm">Warning buffer (grid m)
                <input name="buffer" type="number" min="0" max="10000" step="any" required value={bufferText} onChange={event => {
                  setBufferText(event.target.value); setSetupDirty(true); setSimulated(null); setReviewed(false)
                }} className={field} />
              </label>
              <button className={button}>Apply perimeter & buffer</button>
              {setupDirty && <span className="ml-2 text-xs text-amber-300">Unapplied changes</span>}
            </fieldset>
          </form>
          {setupError && <p role="alert" className="text-sm text-amber-300">{setupError}</p>}
          <h3 className="border-t border-[var(--border-color)] pt-3 font-semibold">Circular exclusion zones</h3>
          <ul className="space-y-2">
            {hazards.map((zone, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">{zone.type} · {zone.radius} m radius<br /><span className="text-xs text-[var(--text-secondary)]">E {zone.center.easting} · N {zone.center.northing}</span></span>
                <button type="button" aria-label={'Remove exclusion ' + (index + 1)} disabled={tracking} className={button} onClick={() => {
                  setHazards(previous => previous.filter((_, other) => other !== index)); setReviewed(false); setSimulated(null)
                }}>Remove</button>
              </li>
            ))}
          </ul>
          <form onSubmit={addHazard}>
            <fieldset disabled={tracking || hazards.length >= 50} className="grid grid-cols-3 gap-2">
              <label className="col-span-3 text-xs">Exclusion name<input name="name" maxLength={100} required className={field} /></label>
              <label className="text-xs">Easting (m)<input name="easting" type="number" step="any" required className={field} /></label>
              <label className="text-xs">Northing (m)<input name="northing" type="number" step="any" required className={field} /></label>
              <label className="text-xs">Radius (m)<input name="radius" type="number" max="10000" step="any" required className={field} /></label>
              <button className={button + ' col-span-3 justify-self-start'}>Add exclusion</button>
            </fieldset>
          </form>
          {hazards.length >= 50 && <p className="text-xs text-amber-300">This session supports up to 50 exclusions.</p>}
          {hazardError && <p role="alert" className="text-sm text-amber-300">{hazardError}</p>}
        </section>
      </div>

      <section className={panel} aria-labelledby="geofence-log-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="geofence-log-heading" className="font-semibold">Session incidents ({incidents.length})</h2>
          <button type="button" onClick={downloadLog} disabled={!incidents.length} className={button}>Export incident CSV</button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Latest 200 alert transitions, labelled by position source. Export before leaving this page.</p>
        {incidents.length === 0 ? <p className="text-sm">No alerts recorded this session.</p> : (
          <ol className="max-h-60 space-y-1 overflow-auto">
            {incidents.map((event, index) => (
              <li key={event.timestamp + index} className="break-words border-t border-[var(--border-color)] py-2 text-sm">
                {event.source === 'device' ? 'Device' : 'Simulation'} · {statusLabels[event.status]}{event.hazard ? ' · ' + event.hazard : ''}
                <span className="block text-xs text-[var(--text-secondary)]">{event.timestamp} · E {event.point.easting.toFixed(2)} · N {event.point.northing.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
