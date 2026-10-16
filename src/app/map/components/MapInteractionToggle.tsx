'use client'

import { useEffect, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { MapOverlaySlot } from './MapOverlayManager'
import { useMapContext } from '../MapReactContext'
import type Map from 'ol/Map'

/** Optional pan lock. Normal dragging is enabled by default, with native inertia. */
export function MapInteractionToggle({ mapInstance }: { mapInstance: React.MutableRefObject<Map | null> }) {
  const { isMobile, mapReady } = useMapContext()
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady || !isMobile) return
    let cancelled = false
    let restore: (() => void) | undefined
    void import('ol/interaction/DragPan').then(({ default: DragPan }) => {
      if (cancelled) return
      const pans = map.getInteractions().getArray().filter(interaction => interaction instanceof DragPan)
      const previous = pans.map(pan => pan.getActive())
      pans.forEach(pan => pan.setActive(!locked))
      restore = () => pans.forEach((pan, index) => pan.setActive(previous[index]))
    })
    return () => { cancelled = true; restore?.() }
  }, [mapInstance, mapReady, isMobile, locked])
  if (!isMobile) return null
  return (
    <MapOverlaySlot id="gesture-lock" anchor="bottom-left" order={50} layer="CONTROLS" className="map-gesture-lock">
      <button type="button" onClick={() => setLocked(value => !value)} aria-label={locked ? 'Enable map panning' : 'Lock map panning'} aria-pressed={locked} title={locked ? 'Enable ordinary dragging' : 'Lock panning while working'} className="map-pan-lock">
        {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>
    </MapOverlaySlot>
  )
}
