'use client'

import { memo, useState, useEffect } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'
import { describeCrs } from '@/lib/spatial/projectCrs'

export const MapStatusBar = memo(function MapStatusBar() {
  const { mouseCoord, projectCount, currentSurveyCrs, gpsTracking, gpsPos, schemeProjectId } = useMapContext()
  const [isOnline, setIsOnline] = useState(true)
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null)
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  // The active project name is authoritative from the project record, not
  // inferred from the URL. A failed lookup leaves the id visible so the
  // surveyor still knows which project the map is writing into.
  useEffect(() => {
    if (!schemeProjectId) { setActiveProjectName(null); return }
    let cancelled = false
    fetch(`/api/project/${encodeURIComponent(schemeProjectId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload: unknown) => {
        if (cancelled) return
        const name = (payload as { data?: { name?: unknown } })?.data?.name
        setActiveProjectName(typeof name === 'string' && name ? name : null)
      })
      .catch(() => { if (!cancelled) setActiveProjectName(null) })
    return () => { cancelled = true }
  }, [schemeProjectId])

  // Datum and transformation provenance for the active survey CRS. The
  // registry is the single source of truth; the status bar never infers a
  // datum from a code.
  const surveyCrsInfo = currentSurveyCrs ? describeCrs(currentSurveyCrs) : null
  const surveyLabel = surveyCrsInfo
    ? `Survey CRS: ${surveyCrsInfo.code} · ${surveyCrsInfo.datum}`
    : 'Survey CRS: not set'
  const transformationNote = surveyCrsInfo?.notes
    ? ` · ${surveyCrsInfo.notes}`
    : ''
  const unitsLabel = surveyCrsInfo?.units ?? 'not set'
  const projectLabel = schemeProjectId
    ? `Project: ${activeProjectName ?? schemeProjectId}`
    : 'No project linked'

  return (
    <footer className="map-status-strip" aria-label="Map status">
      <div className="map-status-coordinates">
        {mouseCoord ? <>
          <span><abbr title="Latitude">Lat</abbr>{mouseCoord.lat.toFixed(6)}°</span>
          <span><abbr title="Longitude">Lon</abbr>{mouseCoord.lon.toFixed(6)}°</span>
          {mouseCoord.epsg && mouseCoord.e !== null && mouseCoord.n !== null ? <>
            <span className="text-[var(--accent)]"><abbr title={`Easting in ${unitsLabel}`}>E</abbr>{mouseCoord.e.toFixed(3)}</span>
            <span className="text-[var(--accent)]"><abbr title={`Northing in ${unitsLabel}`}>N</abbr>{mouseCoord.n.toFixed(3)}</span>
          </> : null}
        </> : <span>Move the pointer for coordinates</span>}
        <span title={`Survey CRS: ${surveyCrsInfo?.name ?? 'not set'}${transformationNote}`}>
          {surveyLabel}
        </span>
        <span className="hidden lg:inline" title="Display CRS: WGS 84 / Pseudo-Mercator (Web Mercator). Display only — never used for survey mathematics.">
          Display CRS: EPSG:3857
        </span>
        <span title="Units used by the survey CRS for displayed eastings, northings and distances.">{unitsLabel}</span>
        <span title={schemeProjectId ? `Active project: ${projectLabel}` : 'Capture tools stay disabled until a project is linked.'}>{projectLabel}</span>
      </div>
      <div className="map-device-status">
        <span title="Browser online/offline state. Field edits are kept locally while offline.">{isOnline ? 'Online' : 'Offline'}</span>
        <span title={gpsTracking && gpsPos ? 'Device location (browser geolocation). Not an RTK/GNSS solution; satellite count is unavailable because no receiver is connected.' : 'Browser device location does not establish an RTK solution.'}>
          {gpsTracking ? (gpsPos ? `Device ±${Math.round(gpsPos.accuracy)} m · no GNSS receiver` : 'Locating device…') : 'Device location off'}
        </span>
        <span>{projectCount} project{projectCount === 1 ? '' : 's'}</span>
      </div>
    </footer>
  )
})
