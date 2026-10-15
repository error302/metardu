'use client'

import { memo, useState, useEffect } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'

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
        <span>{currentSurveyCrs ? `Survey ${currentSurveyCrs}` : 'Survey CRS required'}</span>
        <span className="hidden lg:inline">Display EPSG:3857</span>
      </div>
      <div className="map-device-status">
        {!isOnline && <span>Offline</span>}
        <span title="Browser device location does not establish an RTK solution.">{gpsTracking ? gpsPos ? `Device ±${Math.round(gpsPos.accuracy)} m` : 'Locating device…' : 'GPS off'}</span>
        <span>{projectCount} project{projectCount === 1 ? '' : 's'}</span>
      </div>
    </footer>
  )
})
