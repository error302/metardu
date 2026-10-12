'use client'

/**
 * useTraverseParcelPreview — turn a computed traverse into a parcel boundary
 * (plan Phase 5: MapClient thinning).
 *
 * Checks whether the current project has computed traverses, fetches the
 * traverse coordinates, renders them as a temporary polygon preview layer,
 * and commits the boundary through `createParcelFromTraverse`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
import {
  createParcelFromTraverse,
  createTraversePolygonPreview,
  removeTraversePolygonPreview,
} from '@/lib/map/traverseToParcel'

export interface UseTraverseParcelPreviewParams {
  schemeProjectId: string | null
  mapInstance: React.RefObject<import('ol/Map').default | null>
  schemeLoaded: boolean
  setSaveMsg: (msg: string) => void
}

export function useTraverseParcelPreview({
  schemeProjectId,
  mapInstance,
  schemeLoaded,
  setSaveMsg,
}: UseTraverseParcelPreviewParams) {
  const [traverseParcelPreviewActive, setTraverseParcelPreviewActive] = useState(false)
  const [hasTraverse, setHasTraverse] = useState(false)
  const traversePreviewLayerRef = useRef<import('ol/layer/Vector').default | null>(null)

  // ── Traverse-to-parcel: check if traverse exists ──
  useEffect(() => {
    if (!schemeProjectId || !schemeLoaded) return
    // Check if there are computed traverses for this project
    const checkTraverse = async () => {
      try {
        const res = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
        if (res.ok) {
          const data = (await res.json()) as { data?: { hasTraverses?: boolean } }
          setHasTraverse(data.data?.hasTraverses ?? false)
        }
      } catch {
        // API not available — assume no traverse
        setHasTraverse(false)
      }
    }
    checkTraverse()
  }, [schemeProjectId, schemeLoaded])

  // ── Traverse-to-parcel: create preview ──
  const createParcelFromTraversePreview = useCallback(async () => {
    if (!schemeProjectId || !mapInstance.current) return

    try {
      // Fetch traverse data to get coordinates
      const res = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
      if (!res.ok) throw new Error('Failed to fetch traverse summary')
      const summaryData = (await res.json()) as { data?: { parcels?: Array<{ id: string | number }> } }

      // Get the first parcel with a traverse
      const parcelId = summaryData.data?.parcels?.[0]?.id
      if (!parcelId) throw new Error('No parcels with traverses found')

      // Fetch the actual traverse coordinates
      const traverseRes = await fetch(`/api/scheme/traverse?parcel_id=${parcelId}`)
      if (!traverseRes.ok) throw new Error('Failed to fetch traverse coordinates')
      const traverseData = (await traverseRes.json()) as {
        data?: { coordinates?: Array<{ easting: number; northing: number; station?: string }> }
      }

      const coordinates = traverseData.data?.coordinates
      if (!coordinates || coordinates.length < 3) {
        throw new Error('Traverse has fewer than 3 stations — cannot form a polygon')
      }

      const traversePoints = coordinates.map((c) => ({
        easting: c.easting,
        northing: c.northing,
        pointName: c.station || '',
      }))

      // Create the preview layer
      const { layer } = await createTraversePolygonPreview(traversePoints)
      mapInstance.current.addLayer(layer)
      traversePreviewLayerRef.current = layer

      // Zoom to the preview
      const source = layer.getSource()
      if (source) {
        const extent = source.getExtent()
        if (extent && extent[0] !== Infinity) {
          mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 600 })
        }
      }

      setTraverseParcelPreviewActive(true)
    } catch (err) {
      logger.error('[useTraverseParcelPreview] Traverse preview failed:', { error: err })
      setSaveMsg(err instanceof Error ? err.message : 'Failed to preview traverse')
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }, [schemeProjectId, mapInstance, setSaveMsg])

  // ── Traverse-to-parcel: confirm and save ──
  const confirmTraverseParcel = useCallback(async () => {
    if (!schemeProjectId) return

    try {
      // Get the first parcel with a traverse
      const summaryRes = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
      const summaryData = (await summaryRes.json()) as { data?: { parcels?: Array<{ id: string | number }> } }
      const parcelId = summaryData.data?.parcels?.[0]?.id

      if (!parcelId) throw new Error('No parcel found for traverse')

      const result = await createParcelFromTraverse(schemeProjectId, String(parcelId))

      // Remove the preview layer
      if (mapInstance.current) {
        removeTraversePolygonPreview(mapInstance.current, traversePreviewLayerRef.current)
      }
      traversePreviewLayerRef.current = null
      setTraverseParcelPreviewActive(false)

      const areaHa = result.areaHa?.toFixed(4) ?? 'unknown'
      setSaveMsg(`Parcel boundary created: ${areaHa} ha`)
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (err) {
      logger.error('[useTraverseParcelPreview] Traverse confirm failed:', { error: err })
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save parcel boundary')
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }, [schemeProjectId, mapInstance, setSaveMsg])

  // ── Traverse-to-parcel: cancel and remove preview ──
  const cancelTraverseParcel = useCallback(() => {
    if (mapInstance.current && traversePreviewLayerRef.current) {
      removeTraversePolygonPreview(mapInstance.current, traversePreviewLayerRef.current)
      traversePreviewLayerRef.current = null
    }
    setTraverseParcelPreviewActive(false)
  }, [mapInstance])

  return {
    traverseParcelPreviewActive,
    hasTraverse,
    createParcelFromTraversePreview,
    confirmTraverseParcel,
    cancelTraverseParcel,
  }
}
