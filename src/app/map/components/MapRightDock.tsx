'use client'

import { memo, useCallback } from 'react'
import { Plus, Minus, LocateFixed, LocateOff } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { NorthArrowOverlay } from './NorthArrowOverlay'
import { MapPrintButton } from './MapPrintButton'

export const MapRightDock = memo(function MapRightDock() {
  const { mapInstance, gpsTracking, toggleGPS } = useMapContext()
  const zoom = useCallback((step: number) => {
    const view = mapInstance.current?.getView()
    if (!view) return
    view.animate({ zoom: Math.min(view.getMaxZoom(), Math.max(view.getMinZoom(), (view.getZoom() ?? 0) + step)), duration: 200 })
  }, [mapInstance])
  return (
    <div className="map-navigation-dock absolute z-30 flex flex-col items-end gap-2 select-none" role="region" aria-label="Map navigation controls">
      <div className="map-zoom-buttons" role="group" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in" title="Zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out" title="Zoom out"><Minus className="h-4 w-4" /></button>
      </div>
      <NorthArrowOverlay mapInstance={mapInstance} />
      <button type="button" className="map-gps-toggle" onClick={toggleGPS} aria-pressed={gpsTracking} aria-label={gpsTracking ? 'Turn GPS off' : 'Turn GPS on'} title={gpsTracking ? 'Turn device location off' : 'Use device location'}>{gpsTracking ? <LocateFixed className="h-4 w-4" /> : <LocateOff className="h-4 w-4" />}</button>
      <MapPrintButton />
    </div>
  )
})
