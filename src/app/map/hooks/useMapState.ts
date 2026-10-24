'use client'
/**
 * useMapState — Map view/feature persistence hook
 *
 * Saves map center/zoom and drawn features to localStorage:
 * - Every 10 seconds (interval)
 * - On unmount
 *
 * Uses JSON+GeoJSON format for feature serialization.
 * Only runs when map is ready.
 *
 * Linked projects use their separate versioned drawing/recovery workflow.
 */

import { useEffect } from 'react'
import type Map from 'ol/Map'
import { encodeMapDrawing } from '@/lib/mapDrawing/codec'

export function useMapState(
  mapInstance: React.MutableRefObject<Map | null>,
  drawSourceRef: React.MutableRefObject<import('ol/source/Vector').default | null>,
  mapReady: boolean,
  linkedProjectId: string | null = null,
  browserDrawingReady = true,
  onRecoveryError?: (message: string) => void
) {
  useEffect(() => {
    if (!mapInstance.current || linkedProjectId || !browserDrawingReady) return

    const saveViewState = () => {
      try {
        const view = mapInstance.current?.getView()
        if (view) {
          const center = view.getCenter()
          const zoom = view.getZoom()
          if (center && zoom != null) {
            localStorage.setItem('metardu-map-view', JSON.stringify({ center, zoom }))
          }
        }
      } catch { /* keep the prior view record */ }
    }

    const saveFeatures = async () => {
      try {
        if (drawSourceRef.current) {
          const features = drawSourceRef.current.getFeatures()
          if (features.length > 0) {
            const geojson = JSON.stringify(encodeMapDrawing(features))
            localStorage.setItem('metardu-map-features', JSON.stringify(geojson))
          } else {
            localStorage.removeItem('metardu-map-features')
          }
        }
      } catch {
        onRecoveryError?.('The current browser drawing could not be retained. The older record is unchanged; download the current drawing before closing this page.')
      }
    }

    const interval = setInterval(() => {
      saveViewState()
      saveFeatures()
    }, 10000)

    return () => {
      clearInterval(interval)
      saveViewState()
      void saveFeatures()
    }
  }, [mapReady, drawSourceRef, mapInstance, linkedProjectId, browserDrawingReady, onRecoveryError])
}
