'use client'

import { memo, useCallback } from 'react'
import { Plus, Minus, LocateFixed, LocateOff } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { NorthArrowOverlay } from './NorthArrowOverlay'

/**
 * Map navigation dock. Print lives in the Export panel — the map controls
 * carry only navigation (zoom, north, locate) so a surveyor can never
 * download an unbranded sheet by tapping the wrong icon beside the map.
 */
export const MapRightDock = memo(function MapRightDock() {
  const { mapInstance, gpsTracking, gpsPos, toggleGPS } = useMapContext()
  const zoom = useCallback((step: number) => {
    const view = mapInstance.current?.getView()
    if (!view) return
    view.animate({ zoom: Math.min(view.getMaxZoom(), Math.max(view.getMinZoom(), (view.getZoom() ?? 0) + step)), duration: 200 })
  }, [mapInstance])

  // Three honest locate states: off, searching (no fix yet), fixed.
  // Device geolocation is never a GNSS/RTK solution, so the fixed label
  // reports the achieved accuracy instead of implying survey control.
  const locateState = !gpsTracking ? 'off' : gpsPos ? 'fixed' : 'searching'
  const locateLabel = locateState === 'off'
    ? 'Locate'
    : locateState === 'searching'
      ? 'Locating…'
      : `±${Math.round(gpsPos?.accuracy ?? 0)} m`
  const locateTitle = locateState === 'off'
    ? 'Use device location (browser geolocation, not RTK)'
    : locateState === 'searching'
      ? 'Searching for a device location fix…'
      : `Device location ±${Math.round(gpsPos?.accuracy ?? 0)} m. Not an RTK/GNSS solution.`

  return (
    <div className="map-navigation-dock absolute z-30 flex flex-col items-end gap-2 select-none" role="region" aria-label="Map navigation controls">
      <div className="map-zoom-buttons" role="group" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in" title="Zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out" title="Zoom out"><Minus className="h-4 w-4" /></button>
      </div>
      <NorthArrowOverlay mapInstance={mapInstance} />
      <button
        type="button"
        className={`map-gps-toggle map-gps-toggle--${locateState}`}
        onClick={toggleGPS}
        aria-pressed={gpsTracking}
        aria-label={gpsTracking ? 'Turn device location off' : 'Turn device location on'}
        title={locateTitle}
      >
        {gpsTracking ? <LocateFixed className={`h-4 w-4${locateState === 'searching' ? ' animate-pulse' : ''}`} /> : <LocateOff className="h-4 w-4" />}
      </button>
      <span className="map-locate-readout" role="status" aria-live="polite">{locateLabel}</span>
    </div>
  )
})
