'use client'

import { memo, useState, useEffect } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'
import { describeCrs } from '@/lib/spatial/projectCrs'

export const MapStatusBar = memo(function MapStatusBar() {
  const { mouseCoord, projectCount, currentSurveyCrs, gpsTracking, gpsPos } = useMapContext()
  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

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

  return (
    <footer className="map-status-strip" aria-label="Map status">
      <div className="map-status-coordinates">
        {mouseCoord ? <>
          <span><abbr title="Latitude">Lat</abbr>{mouseCoord.lat.toFixed(6)}°</span>
          <span><abbr title="Longitude">Lon</abbr>{mouseCoord.lon.toFixed(6)}°</span>
          {mouseCoord.epsg && mouseCoord.e !== null && mouseCoord.n !== null ? <>
            <span className="text-[var(--accent)]"><abbr title="Easting in metres">E</abbr>{mouseCoord.e.toFixed(3)}</span>
            <span className="text-[var(--accent)]"><abbr title="Northing in metres">N</abbr>{mouseCoord.n.toFixed(3)}</span>
          </> : null}
        </> : <span>Move the pointer for coordinates</span>}
        <span title={`Survey CRS: ${surveyCrsInfo?.name ?? 'not set'}${transformationNote}`}>
          {surveyLabel}
        </span>
        <span className="hidden lg:inline" title="Display CRS: WGS 84 / Pseudo-Mercator (Web Mercator). Display only — never used for survey mathematics.">
          Display CRS: EPSG:3857
        </span>
      </div>
      <div className="map-device-status">
        {!isOnline && <span>Offline</span>}
        <span title="Browser device location does not establish an RTK solution.">{gpsTracking ? gpsPos ? `Device ±${Math.round(gpsPos.accuracy)} m` : 'Locating device…' : 'GPS off'}</span>
        <span>{projectCount} project{projectCount === 1 ? '' : 's'}</span>
      </div>
    </footer>
  )
})
