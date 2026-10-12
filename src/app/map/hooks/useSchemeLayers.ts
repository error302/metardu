'use client'

/**
 * useSchemeLayers — /map scheme-layer lifecycle (plan Phase 5: MapClient is
 * thinned to a composition root; this cluster moved here).
 *
 * Owns the scheme (cadastral scheme) overlay state: loading the layers for the
 * current project, snapping the scheme sources to the active vertex editor,
 * seeding vertex-edit vertices from beacons, per-layer visibility toggles,
 * zoom-to-extent, removal and unmount cleanup.
 *
 * All OL work is delegated to the engine (`ol/drawing`, `ol/snapping`,
 * `lib/map/schemeLayer`); this hook only orchestrates state + effects.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OLMap } from '@/lib/map/olTypes'
import { createSchemeLayers, zoomToSchemeExtent } from '@/lib/map/schemeLayer'
import { logger } from '@/lib/logger'
import type VectorSource from 'ol/source/Vector'

export interface UseSchemeLayersParams {
  schemeProjectId: string | null
  mapInstance: React.RefObject<import('ol/Map').default | null>
  mapReady: boolean
  currentSurveyCrs: string | null
  setVertexEditingVertices: React.Dispatch<
    React.SetStateAction<Array<{ easting: number; northing: number }>>
  >
}

export function useSchemeLayers({
  schemeProjectId,
  mapInstance,
  mapReady,
  currentSurveyCrs,
  setVertexEditingVertices,
}: UseSchemeLayersParams) {
  const [schemeLoading, setSchemeLoading] = useState(false)
  const [schemeError, setSchemeError] = useState('')
  const [schemeLoaded, setSchemeLoaded] = useState(false)
  const [schemeParcelCount, setSchemeParcelCount] = useState(0)
  const [schemeBlockCount, setSchemeBlockCount] = useState(0)
  const [schemeBeaconCount, setSchemeBeaconCount] = useState(0)
  const [schemeParcelSnapSource, setSchemeParcelSnapSource] = useState<VectorSource | null>(null)
  const [schemeBeaconSnapSource, setSchemeBeaconSnapSource] = useState<VectorSource | null>(null)
  const [showSchemeParcels, setShowSchemeParcels] = useState(true)
  const [showSchemeBlocks, setShowSchemeBlocks] = useState(true)
  const [showSchemeBeacons, setShowSchemeBeacons] = useState(true)
  const currentProjectIdRef = useRef(schemeProjectId)
  currentProjectIdRef.current = schemeProjectId
  const loadedProjectIdRef = useRef<string | null>(null)
  const suppressedProjectIdRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const schemeCleanupRef = useRef<(() => void) | null>(null)
  const schemeLayersRef = useRef<{
    parcelLayer: import('ol/layer/Vector').default | null
    blockLayer: import('ol/layer/Vector').default | null
    beaconLayer: import('ol/layer/Vector').default | null
    extent: number[] | null
  } | null>(null)

  const loadSchemeData = useCallback(async () => {
    if (!schemeProjectId || !mapInstance.current || schemeLoading || !currentSurveyCrs) return

    const requestId = ++requestIdRef.current
    const requestedProjectId = schemeProjectId
    suppressedProjectIdRef.current = null
    setSchemeLoading(true)
    setSchemeError('')

    try {
      // Clean up any existing scheme layers first
      if (schemeCleanupRef.current) {
        schemeCleanupRef.current()
        schemeCleanupRef.current = null
        schemeLayersRef.current = null
      }
      setSchemeParcelSnapSource(null)
      setSchemeBeaconSnapSource(null)

      const result = await createSchemeLayers(
        requestedProjectId,
        mapInstance.current as unknown as OLMap,
        {
          autoZoom: true,
          showParcelLabels: true,
          epsg: currentSurveyCrs,
        }
      )

      if (requestId !== requestIdRef.current || currentProjectIdRef.current !== requestedProjectId) {
        result.cleanup()
        return
      }

      schemeLayersRef.current = {
        parcelLayer: result.parcelLayer,
        blockLayer: result.blockLayer,
        beaconLayer: result.beaconLayer,
        extent: result.extent,
      }
      let resultCleaned = false
      const cleanupSchemeResult = () => {
        if (resultCleaned) return
        resultCleaned = true
        result.cleanup()
      }
      schemeCleanupRef.current = cleanupSchemeResult
      setSchemeParcelSnapSource(result.parcelLayer.getSource())
      setSchemeBeaconSnapSource(result.beaconLayer.getSource())

      setSchemeParcelCount(result.parcelCount)
      setSchemeBlockCount(result.blockCount)
      setSchemeBeaconCount(result.beaconCount)
      setSchemeLoaded(true)
      loadedProjectIdRef.current = requestedProjectId

      // ── Extract beacon vertices for vertex editing (Tier 2) ──
      // Beacon coordinates are transformed for display but retain project-grid attributes.
      const beaconSource = result.beaconLayer.getSource()
      if (beaconSource) {
        const beaconFeatures = beaconSource.getFeatures()
        const beaconVertices = beaconFeatures
          .map((f: import('ol/Feature').default) => {
            const geom = f.getGeometry()
            if (!geom || geom.getType() !== 'Point') return null
            // Beacon coordinates are stored in EPSG:3857 (display projection)
            // Use those original project-grid attributes for vertex editing.
            return { easting: f.get('easting') as number, northing: f.get('northing') as number }
          })
          .filter(
            (v: { easting: number; northing: number } | null): v is { easting: number; northing: number } =>
              v !== null && v.easting !== undefined && v.northing !== undefined
          )
        if (beaconVertices.length >= 3) {
          setVertexEditingVertices(beaconVertices)
        }
      }
    } catch (err) {
      if (requestId !== requestIdRef.current || currentProjectIdRef.current !== requestedProjectId) return
      logger.error('[useSchemeLayers] Failed to load scheme data:', { error: err })
      setSchemeError(err instanceof Error ? err.message : 'Failed to load scheme data')
      setSchemeLoaded(false)
    } finally {
      if (requestId === requestIdRef.current) setSchemeLoading(false)
    }
  }, [schemeProjectId, schemeLoading, currentSurveyCrs, mapInstance, setVertexEditingVertices])

  useEffect(() => {
    if (loadedProjectIdRef.current === schemeProjectId) return
    requestIdRef.current++
    schemeCleanupRef.current?.()
    schemeCleanupRef.current = null
    schemeLayersRef.current = null
    setSchemeParcelSnapSource(null)
    setSchemeBeaconSnapSource(null)
    loadedProjectIdRef.current = null
    suppressedProjectIdRef.current = null
    setSchemeLoading(false)
    setSchemeError('')
    setSchemeLoaded(false)
    setSchemeParcelCount(0)
    setSchemeBlockCount(0)
    setSchemeBeaconCount(0)
    setVertexEditingVertices([])
  }, [schemeProjectId, setVertexEditingVertices])

  // ── Scheme layer: auto-load when projectId is available ──
  useEffect(() => {
    if (schemeProjectId && suppressedProjectIdRef.current !== schemeProjectId && currentSurveyCrs && mapReady && !schemeLoaded && !schemeLoading && !schemeError) {
      loadSchemeData()
    }
  }, [schemeProjectId, currentSurveyCrs, mapReady, schemeLoaded, schemeLoading, schemeError, loadSchemeData])

  const toggleSchemeParcelVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.parcelLayer) return
    const newVisible = !showSchemeParcels
    schemeLayersRef.current.parcelLayer.setVisible(newVisible)
    setShowSchemeParcels(newVisible)
  }, [showSchemeParcels])

  const toggleSchemeBlockVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.blockLayer) return
    const newVisible = !showSchemeBlocks
    schemeLayersRef.current.blockLayer.setVisible(newVisible)
    setShowSchemeBlocks(newVisible)
  }, [showSchemeBlocks])

  const toggleSchemeBeaconVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.beaconLayer) return
    const newVisible = !showSchemeBeacons
    schemeLayersRef.current.beaconLayer.setVisible(newVisible)
    setShowSchemeBeacons(newVisible)
  }, [showSchemeBeacons])

  const zoomToScheme = useCallback(() => {
    if (!mapInstance.current || !schemeLayersRef.current?.extent) return
    zoomToSchemeExtent(
      mapInstance.current as unknown as OLMap,
      schemeLayersRef.current.extent
    )
  }, [mapInstance])

  const removeScheme = useCallback(() => {
    requestIdRef.current++
    suppressedProjectIdRef.current = currentProjectIdRef.current
    loadedProjectIdRef.current = currentProjectIdRef.current
    if (schemeCleanupRef.current) {
      schemeCleanupRef.current()
      schemeCleanupRef.current = null
    }
    schemeLayersRef.current = null
    setSchemeLoaded(false)
    setSchemeLoading(false)
    setSchemeParcelCount(0)
    setSchemeBlockCount(0)
    setSchemeBeaconCount(0)
    setSchemeError('')
    setVertexEditingVertices([])
  }, [setVertexEditingVertices])

  // ── Scheme layer: cleanup on unmount ──
  useEffect(() => {
    const requestState = requestIdRef
    const cleanupState = schemeCleanupRef
    return () => {
      requestState.current++
      if (cleanupState.current) {
        cleanupState.current()
      }
    }
  }, [])

  return {
    schemeLoading,
    schemeError,
    schemeLoaded,
    schemeParcelCount,
    schemeBlockCount,
    schemeBeaconCount,
    schemeParcelSnapSource,
    schemeBeaconSnapSource,
    showSchemeParcels,
    showSchemeBlocks,
    showSchemeBeacons,
    loadSchemeData,
    toggleSchemeParcelVisibility,
    toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility,
    zoomToScheme,
    removeScheme,
  }
}
