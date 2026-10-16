'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { MapCleanupRefs } from '@/lib/map/olTypes'

export interface MapGpsControlParams {
  mapInstance: React.RefObject<import('ol/Map').default | null>
  cleanupRef: React.RefObject<MapCleanupRefs | null>
  mapReady: boolean
  setGpsTracking: (tracking: boolean) => void
  setGpsPos: (position: { lon: number; lat: number; accuracy: number } | null) => void
  setStakeoutActive: (active: boolean) => void
  setSaveMsg: (message: string) => void
}

export function useMapGpsControl({ mapInstance, cleanupRef, mapReady, setGpsTracking, setGpsPos, setStakeoutActive, setSaveMsg }: MapGpsControlParams) {
  const requested = useRef(false)
  const cancelCenter = useRef<(() => void) | null>(null)
  const stop = useCallback(() => {
    requested.current = false
    cancelCenter.current?.(); cancelCenter.current = null
    cleanupRef.current?.geolocation.setTracking(false)
    setGpsTracking(false); setGpsPos(null); setStakeoutActive(false)
  }, [cleanupRef, setGpsTracking, setGpsPos, setStakeoutActive])

  useEffect(() => {
    const gps = cleanupRef.current?.geolocation
    if (!gps || !mapReady) return
    const error = () => { stop(); setSaveMsg('Error: Device location is unavailable. Allow location access in your browser, then try GPS again.') }
    gps.on('error', error)
    return () => { gps.un('error', error); requested.current = false; cancelCenter.current?.(); cancelCenter.current = null; gps.setTracking(false) }
  }, [cleanupRef, mapReady, stop, setSaveMsg])

  return useCallback(() => {
    const gps = cleanupRef.current?.geolocation
    const map = mapInstance.current
    if (!gps || !map) return
    if (requested.current) { stop(); setSaveMsg(''); return }
    requested.current = true
    setSaveMsg(''); setGpsPos(null); setGpsTracking(true)
    const center = () => {
      const position = gps.getPosition()
      if (!requested.current || !gps.getTracking() || !position || position.length < 2 || !position.every(Number.isFinite)) return
      map.getView().animate({ center: position, zoom: 16, duration: 300 })
      gps.un('change:position', center); cancelCenter.current = null
    }
    gps.on('change:position', center)
    cancelCenter.current = () => gps.un('change:position', center)
    try { gps.setTracking(true) } catch { stop(); setSaveMsg('Error: This browser could not start device location. Check location permissions.') }
  }, [cleanupRef, mapInstance, setGpsPos, setGpsTracking, setSaveMsg, stop])
}
