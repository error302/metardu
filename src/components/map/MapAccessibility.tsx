'use client'

import { useEffect, useRef, useState } from 'react'

export interface MapAccessibilityProps {
  /** Whether the map has finished loading */
  mapReady: boolean
  /** Current zoom level */
  zoomLevel?: number
  /** Number of features currently selected */
  selectedFeatureCount?: number
  /** Whether scheme data has been loaded */
  schemeDataLoaded?: boolean
}

/**
 * Visually-hidden live region that announces map state changes to screen readers.
 *
 * Announcements:
 * - "Map loaded" when the map initializes
 * - "Zoomed to level X" when zoom changes
 * - "N features selected" when selection changes
 * - "Scheme data loaded" when scheme data is available
 */
export default function MapAccessibility({
  mapReady,
  zoomLevel,
  selectedFeatureCount,
  schemeDataLoaded,
}: MapAccessibilityProps) {
  const [announcement, setAnnouncement] = useState('')
  const prevMapReady = useRef(false)
  const prevZoom = useRef<number | undefined>(undefined)
  const prevSelectedCount = useRef<number | undefined>(undefined)
  const prevSchemeLoaded = useRef(false)

  useEffect(() => {
    // Announce map loaded (only on transition from not-ready to ready)
    if (mapReady && !prevMapReady.current) {
      setAnnouncement('Map loaded')
    }
    prevMapReady.current = mapReady
  }, [mapReady])

  useEffect(() => {
    // Announce zoom changes
    if (zoomLevel !== undefined && prevZoom.current !== undefined && zoomLevel !== prevZoom.current) {
      setAnnouncement(`Zoomed to level ${Math.round(zoomLevel)}`)
    }
    prevZoom.current = zoomLevel
  }, [zoomLevel])

  useEffect(() => {
    // Announce selection changes
    if (selectedFeatureCount !== undefined && prevSelectedCount.current !== undefined && selectedFeatureCount !== prevSelectedCount.current) {
      setAnnouncement(`${selectedFeatureCount} ${selectedFeatureCount === 1 ? 'feature' : 'features'} selected`)
    }
    prevSelectedCount.current = selectedFeatureCount
  }, [selectedFeatureCount])

  useEffect(() => {
    // Announce scheme data loaded
    if (schemeDataLoaded && !prevSchemeLoaded.current) {
      setAnnouncement('Scheme data loaded')
    }
    prevSchemeLoaded.current = schemeDataLoaded ?? false
  }, [schemeDataLoaded])

  return (
    <div
      className="sr-only"
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      {announcement}
    </div>
  )
}
