'use client'

/**
 * useViewportQuery — Dynamic spatial data loading based on map viewport
 *
 * When the surveyor pans or zooms the map, this hook:
 * 1. Captures the current bounding box (view extent)
 * 2. Transforms from map projection (EPSG:3857) to WGS84 (EPSG:4326)
 * 3. Sends a debounced request to the spatial API
 * 4. Loads nearby parcels, beacons, and field records into the map
 *
 * This creates a "live discovery" experience — as you pan, data appears.
 *
 * Uses:
 * - OpenLayers moveend event
 * - Debounce (500ms) to avoid excessive API calls
 * - transformExtent for CRS conversion
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface ViewportFeature {
  id: string
  type: 'parcel' | 'beacon' | 'field_record' | 'control_point'
  geometry: {
    type: 'Point' | 'Polygon' | 'LineString'
    coordinates: number[] | number[][] | number[][][]
  }
  properties: Record<string, unknown>
}

interface UseViewportQueryOptions {
  mapInstance: React.MutableRefObject<any>
  mapReady: boolean
  enabled?: boolean
  debounceMs?: number
  onFeaturesLoaded?: (features: ViewportFeature[]) => void
}

export function useViewportQuery({
  mapInstance,
  mapReady,
  enabled = true,
  debounceMs = 500,
  onFeaturesLoaded,
}: UseViewportQueryOptions) {
  const [isLoading, setIsLoading] = useState(false)
  const [featureCount, setFeatureCount] = useState(0)
  const [lastExtent, setLastExtent] = useState<string>('')
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRequestRef = useRef<string>('')

  const fetchViewport = useCallback(async () => {
    if (!mapInstance.current || !enabled) return

    try {
      const map = mapInstance.current
      const view = map.getView()
      const extent = view.calculateExtent(map.getSize())

      if (!extent || extent.length !== 4) return

      // Deduplicate: skip if extent hasn't changed meaningfully
      const extentKey = `${extent[0].toFixed(0)},${extent[1].toFixed(0)},${extent[2].toFixed(0)},${extent[3].toFixed(0)}`
      if (extentKey === lastRequestRef.current) return
      lastRequestRef.current = extentKey
      setLastExtent(extentKey)

      // Transform to WGS84 for the API
      const { transformExtent } = await import('ol/proj')
      const wgs84Extent = transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
      const [minLng, minLat, maxLng, maxLat] = wgs84Extent

      setIsLoading(true)

      // Fetch spatial features in viewport
      const params = new URLSearchParams({
        west: minLng.toFixed(6),
        south: minLat.toFixed(6),
        east: maxLng.toFixed(6),
        north: maxLat.toFixed(6),
        limit: '200',
      })

      const res = await fetch(`/api/spatial-index?${params}`)
      if (!res.ok) {
        setIsLoading(false)
        return
      }

      const data = await res.json()
      const features = (data.data?.features || []) as ViewportFeature[]
      setFeatureCount(features.length)
      onFeaturesLoaded?.(features)
    } catch (err) {
      // Silent fail — viewport queries are non-critical
    } finally {
      setIsLoading(false)
    }
  }, [mapInstance, enabled, onFeaturesLoaded])

  // Listen for moveend events
  useEffect(() => {
    if (!mapReady || !enabled || !mapInstance.current) return

    const map = mapInstance.current

    const handleMoveEnd = () => {
      // Debounce to avoid spamming on rapid pan/zoom
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        fetchViewport()
      }, debounceMs)
    }

    map.on('moveend', handleMoveEnd)

    // Initial fetch
    fetchViewport()

    return () => {
      map.un('moveend', handleMoveEnd)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [mapReady, enabled, mapInstance, fetchViewport, debounceMs])

  return {
    isLoading,
    featureCount,
    lastExtent,
    refresh: fetchViewport,
  }
}
