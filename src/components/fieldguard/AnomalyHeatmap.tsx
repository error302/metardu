'use client'

import { useEffect, useRef } from 'react'
import type { CleanedPoint, Anomaly } from '@/types/fieldguard'

interface AnomalyHeatmapProps {
  points: CleanedPoint[]
  anomalies: Anomaly[]
}

export default function AnomalyHeatmap({ points, anomalies }: AnomalyHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const overlayRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current) return

    // Destroy previous map
    if (mapInstance.current) {
      mapInstance.current.setTarget(undefined)
      overlayRef.current = null
    }

    let cancelled = false

    async function initMap() {
      try {
        const [
          MapMod, ViewMod, TileLayerMod, VectorLayerMod, VectorSourceMod,
          OSMMod, StyleMod, CircleStyleMod, FillMod, StrokeMod,
          FeatureMod, PointMod, fromLonLatMod, OverlayMod,
        ] = await Promise.all([
          import('ol/Map'), import('ol/View'), import('ol/layer/Tile'),
          import('ol/layer/Vector'), import('ol/source/Vector'),
          import('ol/source/OSM'), import('ol/style/Style'),
          import('ol/style/Circle'), import('ol/style/Fill'),
          import('ol/style/Stroke'), import('ol/Feature'),
          import('ol/geom/Point'), import('ol/proj'), import('ol/Overlay'),
        ])

        const Map = (MapMod as any).default
        const View = (ViewMod as any).default
        const TileLayer = (TileLayerMod as any).default
        const VectorLayer = (VectorLayerMod as any).default
        const VectorSource = (VectorSourceMod as any).default
        const OSM = (OSMMod as any).default
        const Style = (StyleMod as any).default
        const CircleStyle = (CircleStyleMod as any).default
        const Fill = (FillMod as any).default
        const Stroke = (StrokeMod as any).default
        const Feature = (FeatureMod as any).default
        const Point = (PointMod as any).default
        const fromLonLat = (fromLonLatMod as any).fromLonLat
        const Overlay = (OverlayMod as any).default

        if (cancelled || !mapRef.current) return

        const map = new Map({
          target: mapRef.current,
          layers: [new TileLayer({ source: new OSM() })],
          view: new View({ center: fromLonLat([0, 0]), zoom: 10 }),
        })

        // Setup popup overlay
        if (popupRef.current) {
          const overlay = new Overlay({
            element: popupRef.current,
            autoPan: { animation: { duration: 250 } },
          })
          map.addOverlay(overlay)
          overlayRef.current = overlay
        }

        mapInstance.current = map
      } catch (err) {
        console.error('AnomalyHeatmap init failed:', err)
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstance.current) mapInstance.current.setTarget(undefined)
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || points.length === 0) return

    let cancelled = false

    async function updateFeatures() {
      try {
        const [
          VectorLayerMod, VectorSourceMod, StyleMod, CircleStyleMod,
          FillMod, StrokeMod, FeatureMod, PointMod, fromLonLatMod,
        ] = await Promise.all([
          import('ol/layer/Vector'), import('ol/source/Vector'),
          import('ol/style/Style'), import('ol/style/Circle'),
          import('ol/style/Fill'), import('ol/style/Stroke'),
          import('ol/Feature'), import('ol/geom/Point'), import('ol/proj'),
        ])

        const VectorLayer = (VectorLayerMod as any).default
        const VectorSource = (VectorSourceMod as any).default
        const Style = (StyleMod as any).default
        const CircleStyle = (CircleStyleMod as any).default
        const Fill = (FillMod as any).default
        const Stroke = (StrokeMod as any).default
        const Feature = (FeatureMod as any).default
        const Point = (PointMod as any).default
        const fromLonLat = (fromLonLatMod as any).fromLonLat

        if (cancelled) return

        const anomalyIds = new Set(anomalies.map((a) => a.point_id))

        const features = points.map((pt, i) => {
          const isAnomaly = anomalyIds.has(String(i))
          const color = !pt.cleaned ? '#ef4444' : pt.classification === 'ground' ? '#22c55e' : '#3b82f6'
          const strokeColor = isAnomaly ? '#dc2626' : '#1e40af'
          const strokeWidth = isAnomaly ? 3 : 1

          const feature = new Feature({
            geometry: new Point(fromLonLat([pt.easting, pt.northing])),
          })
          feature.setStyle(new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
            }),
          }))
          feature.set('popupText',
            `<b>Point ${i}</b><br/>` +
            `E: ${pt.easting.toFixed(3)}<br/>` +
            `N: ${pt.northing.toFixed(3)}<br/>` +
            `RL: ${pt.elevation?.toFixed(3) || 'N/A'}<br/>` +
            `Status: ${pt.cleaned ? 'Clean' : 'Flagged'}<br/>` +
            `Classification: ${pt.classification || 'N/A'}`
          )
          feature.set('index', i)
          return feature
        })

        const vectorSource = new VectorSource({ features })

        // Remove old vector layers, add new one
        const existing = map.getLayers().getArray().find((l: any) => l instanceof VectorLayer)
        if (existing) map.removeLayer(existing)

        map.addLayer(new VectorLayer({ source: vectorSource }))

        // Fit to features
        const extent = vectorSource.getExtent()
        map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 18 })

        // Click handler for popup
        const handleClick = (evt: any) => {
          const overlay = overlayRef.current
          if (!overlay || !popupRef.current) return

          const feature = map.forEachFeatureAtPixel(evt.pixel, (f: any) => f)
          if (feature && feature.get('popupText')) {
            popupRef.current.innerHTML = feature.get('popupText')
            overlay.setPosition(evt.coordinate)
          } else {
            overlay.setPosition(undefined)
          }
        }

        map.on('click', handleClick)

        return () => {
          map.un('click', handleClick)
        }
      } catch (err) {
        console.error('AnomalyHeatmap feature update failed:', err)
      }
    }

    const cleanupPromise = updateFeatures()

    return () => {
      cancelled = true
      cleanupPromise.then((cleanup) => { if (cleanup) cleanup() }).catch(() => {})
    }
  }, [points, anomalies])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Anomaly Visualization</h3>

      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500"></span> Ground
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span> Other
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500"></span> Flagged
        </span>
      </div>

      <div ref={mapRef} className="h-96 rounded-lg overflow-hidden" />
      <div ref={popupRef} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded p-2 text-sm shadow-lg" style={{ display: 'none' }}></div>
    </div>
  )
}
