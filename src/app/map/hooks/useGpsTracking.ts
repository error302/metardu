'use client'

/**
 * useGpsTracking — GPS position plumbing for /map (plan Phase 5: MapClient
 * thinning).
 *
 * Two concerns live here:
 *  1. Listen to the map's Geolocation control and publish the display-CRS
 *     (EPSG:4326) position + accuracy.
 *  2. Derive the declared project-CRS position that StakeoutPanel
 *     and the stakeout overlay need — always asynchronously, because the
 *     synchronous proj4 require that broke ESM is gone.
 */
import { useEffect, useState } from 'react'
import type { MapCleanupRefs } from '@/lib/map/olTypes'
import { SRID_4326 } from '@/lib/map/projection'

export interface UseGpsTrackingParams {
  mapInstance: React.RefObject<import('ol/Map').default | null>
  mapReady: boolean
  cleanupRef: React.RefObject<MapCleanupRefs | null>
  gpsPos: { lon: number; lat: number; accuracy: number } | null
  setGpsPos: (pos: { lon: number; lat: number; accuracy: number } | null) => void
  currentSurveyCrs: string | null
}

export interface ProjectedGpsPosition {
  easting: number
  northing: number
  accuracy: number
}

/** Keep invalid projection results unavailable instead of turning them into a real-looking origin. */
export function asProjectedGpsPosition(
  coordinates: readonly number[] | null | undefined,
  accuracy: number | null | undefined,
): ProjectedGpsPosition | null {
  if (
    !coordinates || coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
    !Number.isFinite(accuracy) || (accuracy as number) < 0
  ) return null

  return {
    easting: coordinates[0] as number,
    northing: coordinates[1] as number,
    accuracy: accuracy as number,
  }
}

/**
 * GPS position tracking + project-CRS derivation. The stakeout-overlay
 * refresh effect lives in MapClient because it needs `interactions`, which is
 * itself constructed with the project-CRS position this hook returns.
 */

export function useGpsTracking({
  mapInstance,
  mapReady,
  cleanupRef,
  gpsPos,
  setGpsPos,
  currentSurveyCrs,
}: UseGpsTrackingParams) {
  const [gpsPosInSurveyCrs, setGpsPosInSurveyCrs] = useState<{
    easting: number
    northing: number
    accuracy: number
  } | null>(null)

  // ── Geolocation position tracking ──
  useEffect(() => {
    if (!mapInstance.current) return
    if (!cleanupRef.current?.geolocation) return

    const geolocation = cleanupRef.current.geolocation

    const onPositionChange = async () => {
      const pos = geolocation.getPosition()
      if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) {
        setGpsPos(null)
        return
      }
      try {
        const { transform } = await import('ol/proj')
        const lonLat = transform(pos, 'EPSG:3857', SRID_4326) as [number, number]
        const accuracy = geolocation.getAccuracy()
        if (!Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1]) || !Number.isFinite(accuracy)) {
          setGpsPos(null)
          return
        }
        setGpsPos({ lon: lonLat[0], lat: lonLat[1], accuracy })
      } catch {
        // Do not leave a stale location visible when the conversion fails.
        setGpsPos(null)
      }
    }

    const onPositionError = () => setGpsPos(null)

    geolocation.on('change:position', onPositionChange)
    geolocation.on('change:error', onPositionError)
    return () => {
      geolocation.un('change:position', onPositionChange)
      geolocation.un('change:error', onPositionError)
    }
  }, [mapReady, mapInstance, cleanupRef, setGpsPos])

  // ── GPS position in the project CRS (for StakeoutPanel) ──
  useEffect(() => {
    if (!gpsPos || !currentSurveyCrs) {
      setGpsPosInSurveyCrs(null)
      return
    }
    const currentGpsPos = gpsPos // capture for async closure
    const surveyCrs = currentSurveyCrs
    let cancelled = false
    async function transformGpsPos() {
      try {
        const { registerProjectProjection } = await import('@/lib/map/projection')
        await registerProjectProjection(surveyCrs)
        const { transform } = await import('ol/proj')
        if (cancelled) return
        const coordinates = transform(
          [currentGpsPos.lon, currentGpsPos.lat],
          SRID_4326,
          surveyCrs
        )
        setGpsPosInSurveyCrs(asProjectedGpsPosition(coordinates, currentGpsPos.accuracy))
      } catch {
        if (!cancelled) setGpsPosInSurveyCrs(null)
      }
    }
    transformGpsPos()
    return () => {
      cancelled = true
    }
  }, [gpsPos, currentSurveyCrs])

  return { gpsPosInSurveyCrs }
}
