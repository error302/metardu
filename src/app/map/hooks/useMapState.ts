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
 */

import { useEffect } from 'react'

export function useMapState(
  mapInstance: React.MutableRefObject<any>,
  drawSourceRef: React.MutableRefObject<any>,
  mapReady: boolean
) {
  useEffect(() => {
    if (!mapInstance.current) return

    const interval = setInterval(() => {
      try {
        const view = mapInstance.current?.getView()
        if (view) {
          const center = view.getCenter()
          const zoom = view.getZoom()
          if (center && zoom != null) {
            localStorage.setItem('metardu-map-view', JSON.stringify({ center, zoom }))
          }
        }
        if (drawSourceRef.current) {
          const features = drawSourceRef.current.getFeatures()
          if (features.length > 0) {
            const { default: GeoJSONFormat } = require('ol/format/GeoJSON')
            const fmt = new GeoJSONFormat()
            const geojson = fmt.writeFeatures(features, {
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326',
            })
            localStorage.setItem('metardu-map-features', JSON.stringify(geojson))
          } else {
            localStorage.removeItem('metardu-map-features')
          }
        }
      } catch { /* ignore */ }
    }, 10000)

    return () => {
      clearInterval(interval)
      try {
        const view = mapInstance.current?.getView()
        if (view) {
          const center = view.getCenter()
          const zoom = view.getZoom()
          if (center && zoom != null) {
            localStorage.setItem('metardu-map-view', JSON.stringify({ center, zoom }))
          }
        }
      } catch { /* ignore */ }
    }
  }, [mapReady])
}
