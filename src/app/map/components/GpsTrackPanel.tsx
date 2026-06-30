'use client'
/**
 * GpsTrackPanel — GPS track logging panel
 *
 * Start/Stop GPS track logging. When started, accumulates GPS positions from
 * context. When stopped, creates a LineString feature from the accumulated
 * positions and adds it to the map as a vector layer (orange line, 3px).
 * Shows total track distance and point count.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Play, Square, MapPin, ChevronDown } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

export const GpsTrackPanel = memo(function GpsTrackPanel() {
  const { mapInstance, gpsPos, gpsTracking } = useMapContext()
  const [isTracking, setIsTracking] = useState(false)
  const [trackPoints, setTrackPoints] = useState<Array<[number, number]>>([])
  const [pointCount, setPointCount] = useState(0)
  const [totalDistance, setTotalDistance] = useState(0)
  const trackLayerRef = useRef<any>(null)

  // Accumulate GPS positions when tracking is active
  useEffect(() => {
    if (!isTracking || !gpsPos || !mapInstance.current) return

    // Capture current GPS position for the async closure
    const currentGpsPos = gpsPos
    let cancelled = false

    async function addTrackPoint() {
      if (cancelled) return
      try {
        const { fromLonLat } = await import('ol/proj')
        const coord = fromLonLat([currentGpsPos.lon, currentGpsPos.lat]) as [number, number]

        setTrackPoints((prev) => {
          const updated = [...prev, coord]

          // Calculate distance increment
          if (updated.length >= 2) {
            const last = updated[updated.length - 2]
            const dx = coord[0] - last[0]
            const dy = coord[1] - last[1]
            const dist = Math.sqrt(dx * dx + dy * dy)
            // Convert from meters (EPSG:3857 units at equator) — approximate
            const distMeters = dist * Math.cos((currentGpsPos.lat * Math.PI) / 180)
            setTotalDistance((d) => d + Math.abs(distMeters))
          }

          setPointCount(updated.length)
          return updated
        })
      } catch {
        // Skip this point
      }
    }

    addTrackPoint()
    return () => { cancelled = true }
  }, [isTracking, gpsPos, mapInstance])

  const startTracking = useCallback(() => {
    setTrackPoints([])
    setPointCount(0)
    setTotalDistance(0)
    setIsTracking(true)
  }, [])

  const stopTracking = useCallback(async () => {
    setIsTracking(false)

    if (trackPoints.length < 2 || !mapInstance.current) return

    try {
      const [
        { default: VectorSource },
        { default: VectorLayer },
        { default: LineString },
        { default: Feature },
        { default: Style },
        { default: Stroke },
      ] = await Promise.all([
        import('ol/source/Vector'),
        import('ol/layer/Vector'),
        import('ol/geom/LineString'),
        import('ol/Feature'),
        import('ol/style/Style'),
        import('ol/style/Stroke'),
      ])

      const geometry = new LineString(trackPoints)
      const feature = new Feature({ geometry })
      feature.set('trackLog', true)
      feature.set('trackDate', new Date().toISOString())

      // Remove previous track layer if it exists
      if (trackLayerRef.current) {
        mapInstance.current.removeLayer(trackLayerRef.current)
      }

      const source = new VectorSource({ features: [feature] })
      const layer = new VectorLayer({
        source,
        style: new Style({
          stroke: new Stroke({
            color: '#FF8C00',
            width: 3,
          }),
        }),
        zIndex: 60,
      })

      mapInstance.current.addLayer(layer)
      trackLayerRef.current = layer
    } catch (err) {
      console.error('[GpsTrackPanel] Failed to create track layer:', err)
    }
  }, [trackPoints, mapInstance])

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`
    }
    return `${meters.toFixed(0)} m`
  }

  return (
    <div className="bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] rounded-lg w-56">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#D17B47]" />
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
            GPS Track
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2">
        {/* Start/Stop buttons */}
        <div className="flex gap-2">
          {!isTracking ? (
            <button
              onClick={startTracking}
              disabled={!gpsTracking}
              className="flex-1 h-7 flex items-center justify-center gap-1.5 text-[10px] bg-[#D17B47]/20 text-[#D17B47] border border-[#D17B47]/30 rounded hover:bg-[#D17B47]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={gpsTracking ? 'Start track logging' : 'Enable GPS first'}
            >
              <Play className="w-3 h-3" />
              Start
            </button>
          ) : (
            <button
              onClick={stopTracking}
              className="flex-1 h-7 flex items-center justify-center gap-1.5 text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
              title="Stop track logging and save"
            >
              <Square className="w-3 h-3" />
              Stop &amp; Save
            </button>
          )}
        </div>

        {/* Stats */}
        {isTracking && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-white/[0.03] rounded">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-gray-400">Recording</span>
            </div>
            <span className="text-[10px] text-gray-300 font-mono">{pointCount} pts</span>
          </div>
        )}

        {(pointCount > 0 || totalDistance > 0) && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-white/[0.03] rounded">
            <span className="text-[10px] text-gray-400">Distance</span>
            <span className="text-[10px] text-gray-300 font-mono">{formatDistance(totalDistance)}</span>
          </div>
        )}

        {!gpsTracking && !isTracking && (
          <div className="text-[9px] text-gray-600 text-center py-0.5">
            Enable GPS tracking to log tracks
          </div>
        )}
      </div>
    </div>
  )
})
