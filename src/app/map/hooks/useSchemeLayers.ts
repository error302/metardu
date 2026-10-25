'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type VectorSource from 'ol/source/Vector'
import type { OLMap } from '@/lib/map/olTypes'
import {
  createSchemeLayers,
  zoomToSchemeExtent,
  type SchemeLayerResult,
} from '@/lib/map/schemeLayer'
export interface UseSchemeLayersParams {
  schemeProjectId: string | null
  mapInstance: React.RefObject<import('ol/Map').default | null>
  mapReady: boolean
  currentSurveyCrs: string | null
  setVertexEditingVertices: React.Dispatch<
    React.SetStateAction<Array<{ easting: number; northing: number }>>
  >
}

/** Stored geometry is a background view; it never seeds a new, unordered polygon. */
export function useSchemeLayers({
  schemeProjectId,
  mapInstance,
  mapReady,
  currentSurveyCrs,
}: UseSchemeLayersParams) {
  const [schemeLoading, setLoading] = useState(false),
    [schemeError, setError] = useState(''),
    [schemeLoaded, setLoaded] = useState(false),
    [schemeViewMessage, setMessage] = useState('')
  const [schemeParcelCount, setParcels] = useState(0),
    [schemeBlockCount, setGroups] = useState(0)
  const [showSchemeParcels, setShowParcels] = useState(true),
    [showSchemeBlocks, setShowGroups] = useState(true)
  const [schemeParcelSnapSource, setSnap] = useState<VectorSource | null>(null)
  const key =
      schemeProjectId && currentSurveyCrs
        ? `${schemeProjectId}:${currentSurveyCrs}`
        : null,
    activeKey = useRef(key)
  activeKey.current = key
  const result = useRef<SchemeLayerResult | null>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    busy = useRef(false),
    loaded = useRef<string | null>(null),
    suppressed = useRef<string | null>(null),
    alive = useRef(true)
  const visibility = useRef({
    parcels: showSchemeParcels,
    groups: showSchemeBlocks,
  })
  visibility.current = { parcels: showSchemeParcels, groups: showSchemeBlocks }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      controller.current?.abort()
      result.current?.cleanup()
    }
  }, [])
  const loadSchemeData = useCallback(async () => {
    if (
      !key ||
      !schemeProjectId ||
      !currentSurveyCrs ||
      !mapInstance.current ||
      busy.current
    )
      return
    const current = ++generation.current
    busy.current = true
    suppressed.current = null
    controller.current?.abort()
    result.current?.cleanup()
    result.current = null
    setSnap(null)
    setLoading(true)
    setError('')
    setLoaded(false)
    const request = new AbortController()
    controller.current = request
    const valid = () =>
      alive.current &&
      current === generation.current &&
      activeKey.current === key
    try {
      const created = await createSchemeLayers(
        schemeProjectId,
        mapInstance.current as unknown as OLMap,
        {
          epsg: currentSurveyCrs,
          autoZoom: true,
          showParcelLabels: true,
          signal: request.signal,
          onViewportStatus: (status) => {
            if (!valid()) return
            if (status.loading || status.error || !status.view) setSnap(null)
            setLoading(status.loading)
            setError(status.error ?? '')
            setMessage(status.message)
            setParcels(
              status.view?.features.filter(
                (feature) => feature.properties.kind === 'parcel',
              ).length ?? 0,
            )
            setGroups(
              status.view?.features.filter(
                (feature) => feature.properties.kind === 'density',
              ).length ?? 0,
            )
          },
          onSnapSource: (source) => {
            if (valid()) setSnap(visibility.current.parcels ? source : null)
          },
        },
      )
      if (!valid()) {
        created.cleanup()
        return
      }
      result.current = created
      loaded.current = key
      created.parcelLayer.setVisible(visibility.current.parcels)
      created.blockLayer.setVisible(visibility.current.groups)
      setLoaded(true)
    } catch (failure) {
      if (valid()) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Stored geometry is unavailable.',
        )
        setMessage(
          'Stored geometry is unavailable. No shape is available for snapping.',
        )
        setLoading(false)
        setLoaded(false)
      }
    } finally {
      if (current === generation.current) busy.current = false
    }
  }, [key, schemeProjectId, currentSurveyCrs, mapInstance])
  useEffect(() => {
    generation.current++
    busy.current = false
    controller.current?.abort()
    result.current?.cleanup()
    result.current = null
    loaded.current = null
    suppressed.current = null
    setSnap(null)
    setLoading(false)
    setError('')
    setLoaded(false)
    setMessage('')
    setParcels(0)
    setGroups(0)
  }, [key])
  useEffect(() => {
    if (
      key &&
      mapReady &&
      loaded.current !== key &&
      suppressed.current !== key &&
      !busy.current &&
      !schemeError
    )
      void loadSchemeData()
  }, [key, mapReady, schemeError, loadSchemeData])
  const toggleSchemeParcelVisibility = useCallback(() => {
    const visible = !visibility.current.parcels
    visibility.current.parcels = visible
    setShowParcels(visible)
    result.current?.parcelLayer.setVisible(visible)
    const source = result.current?.parcelSnapSource
    setSnap(visible && source?.getFeatures().length ? source : null)
  }, [])
  const toggleSchemeBlockVisibility = useCallback(() => {
    const visible = !visibility.current.groups
    visibility.current.groups = visible
    setShowGroups(visible)
    result.current?.blockLayer.setVisible(visible)
  }, [])
  const zoomToScheme = useCallback(() => {
    if (mapInstance.current && result.current)
      void zoomToSchemeExtent(
        mapInstance.current as unknown as OLMap,
        result.current.extent,
      )
  }, [mapInstance])
  const removeScheme = useCallback(() => {
    generation.current++
    busy.current = false
    suppressed.current = activeKey.current
    loaded.current = activeKey.current
    controller.current?.abort()
    result.current?.cleanup()
    result.current = null
    setSnap(null)
    setLoading(false)
    setLoaded(false)
    setError('')
    setMessage('Stored geometry layers removed.')
    setParcels(0)
    setGroups(0)
  }, [])
  return {
    schemeLoading,
    schemeError,
    schemeLoaded,
    schemeViewMessage,
    schemeParcelCount,
    schemeBlockCount,
    schemeBeaconCount: 0,
    schemeParcelSnapSource,
    schemeBeaconSnapSource: null,
    showSchemeParcels,
    showSchemeBlocks,
    showSchemeBeacons: false,
    loadSchemeData,
    toggleSchemeParcelVisibility,
    toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility: () => {},
    zoomToScheme,
    removeScheme,
  }
}
