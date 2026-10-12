'use client';

/**
 * OSM Context Overlay — fetches nearby building footprints and roads through
 * the authenticated METARDU API and Python/Overpass worker, then renders the
 * returned GeoJSON as an OpenLayers vector layer.
 *
 * Usage:
 *   <OsmBuildingsLayer map={map} visible={true} />
 *
 * Requires the Python worker's Overpass dependencies and external Overpass
 * availability. The map request is built from its active projection and the
 * visible viewport, then bounded by the API's 2 km radius limit.
 *
 * The layer fetches context on map move/end (debounced) and displays
 * them as semi-transparent cyan/orange polygons/lines — matching METARDU's brand.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, Building2 } from 'lucide-react'
import { logger } from '@/lib/logger'
import { buildOsmContextRequest } from '@/lib/map/osmContextRequest'

interface OsmBuildingsLayerProps {
  map: import('ol/Map').default | null  // OpenLayers Map
  visible: boolean
}

export function OsmBuildingsLayer({ map, visible }: OsmBuildingsLayerProps) {
  const layerRef = useRef<import('ol/layer/Vector').default | null>(null)
  const sourceRef = useRef<import('ol/source/Vector').default | null>(null)
  const formatRef = useRef<import('ol/format/GeoJSON').default | null>(null)
  const [loading, setLoading] = useState(false)
  const [layerReady, setLayerReady] = useState(false)
  const [featureCount, setFeatureCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [coverageLimited, setCoverageLimited] = useState(false)

  // Initialize the OpenLayers vector layer once
  useEffect(() => {
    if (!map || layerRef.current) return

    let cancelled = false

    // AUDIT FIX (H-006, 2026-07-27): switched from `window.ol.*` (a legacy
    // global that isn't loaded — caused "Cannot read properties of undefined
    // (reading 'source')") to dynamic `ol/*` imports, matching every other
    // map component in this codebase.
    ;(async () => {
      try {
        const { default: VectorSource } = await import('ol/source/Vector')
        const { default: VectorLayer } = await import('ol/layer/Vector')
        const { default: GeoJSON } = await import('ol/format/GeoJSON')
        const { default: Style } = await import('ol/style/Style')
        const { default: Fill } = await import('ol/style/Fill')
        const { default: Stroke } = await import('ol/style/Stroke')

        if (cancelled) return

        const source = new VectorSource({})
        const layer = new VectorLayer({
          source,
          style: new Style({
            fill: new Fill({ color: 'rgba(209, 123, 71, 0.15)' }),  // accent at 15% opacity
            stroke: new Stroke({ color: 'rgba(209, 123, 71, 0.6)', width: 1 }),
          }),
          zIndex: 15,  // above basemap, below survey data
        })

        map.addLayer(layer)
        sourceRef.current = source
        layerRef.current = layer
        setLayerReady(true)
        // Store GeoJSON format for later use
        formatRef.current = new GeoJSON()
      } catch (err) {
        if (!cancelled) {
          logger.error('[osm-buildings] Failed to init layer:', { error: err })
        }
      }
    })()

    return () => {
      cancelled = true
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
        sourceRef.current = null
        formatRef.current = null
        setLayerReady(false)
      }
    }
  }, [map])

  // Toggle visibility
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setVisible(visible)
    }
  }, [visible])

  // Fetch buildings on map move (debounced)
  useEffect(() => {
    if (!map || !visible || !layerReady || !sourceRef.current) return

    const source = sourceRef.current
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    let activeRequest: AbortController | null = null

    const fetchBuildings = async () => {
      if (cancelled) return
      const controller = new AbortController()
      activeRequest = controller
      setLoading(true)
      setError(null)
      setCoverageLimited(false)

      try {
        const view = map.getView()
        const params = await buildOsmContextRequest(view, map.getSize())
        if (cancelled || controller.signal.aborted) return

        const res = await fetch('/api/osm/context-geojson', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: unknown } | null
          const message = typeof payload?.error === 'string' ? payload.error : null
          if (res.status === 503) throw new Error(message || 'Map context service is unavailable.')
          if (res.status === 429) throw new Error('Map context is temporarily rate-limited. Try again shortly.')
          throw new Error(message || `Map context request failed (${res.status}).`)
        }

        const data = (await res.json()) as { features?: unknown }
        if (cancelled || controller.signal.aborted) return

        if (!Array.isArray(data?.features)) {
          throw new Error('Map context service returned invalid GeoJSON.')
        }

        const format = formatRef.current
        if (!format) return
        const features = format.readFeatures(data, {
          featureProjection: view.getProjection(),
          dataProjection: 'EPSG:4326',
        })
        if (cancelled || controller.signal.aborted) return
        source.clear()
        source.addFeatures(features)
        setFeatureCount(features.length)
        setCoverageLimited(params.coverageLimited)
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Fetch failed')
        }
      } finally {
        if (activeRequest === controller) {
          activeRequest = null
          if (!cancelled) setLoading(false)
        }
      }
    }

    const onMoveEnd = () => {
      clearTimeout(timeoutId)
      activeRequest?.abort()
      activeRequest = null
      setLoading(false)
      timeoutId = setTimeout(fetchBuildings, 500)  // debounce 500ms
    }

    map.on('moveend', onMoveEnd)
    fetchBuildings()  // initial fetch

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      activeRequest?.abort()
      map.un('moveend', onMoveEnd)
    }
  }, [map, visible, layerReady])

  if (!visible) return null

  return (
    <div role="status" aria-live="polite" className="absolute top-3 right-3 z-30 bg-[#050505]/90 backdrop-blur-xl border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-xs flex items-center gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      <Building2 className="w-3.5 h-3.5 text-cyan-400" />
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Loading Context…</span>
        </>
      ) : error ? (
        <span className="text-[var(--error)]">{error}</span>
      ) : (
        <span className="text-[var(--text-secondary)] font-medium">
          {featureCount} context features{coverageLimited ? ' · zoom in for full coverage' : ''}
        </span>
      )}
    </div>
  )
}
