'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { SoundingPoint } from '@/types/bathymetry'

interface BathymetryMapProps {
  soundings: SoundingPoint[]
  height?: string
}

function getDepthColor(depth: number, minDepth: number, maxDepth: number): string {
  const range = maxDepth - minDepth || 1
  const normalized = (depth - minDepth) / range
  if (normalized < 0.25) return '#1e40af'
  if (normalized < 0.5) return '#3b82f6'
  if (normalized < 0.75) return '#60a5fa'
  return '#93c5fd'
}

export default function BathymetryMap({ soundings, height = '400px' }: BathymetryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  const minDepth = useMemo(() => Math.min(...soundings.map((s: SoundingPoint) => s.depth)), [soundings])
  const maxDepth = useMemo(() => Math.max(...soundings.map((s: SoundingPoint) => s.depth)), [soundings])

  useEffect(() => {
    if (!mapRef.current) return

    // Destroy previous map
    if (mapInstance.current) {
      mapInstance.current.setTarget(undefined)
    }

    let cancelled = false

    async function initMap() {
      try {
        const [
          MapMod, ViewMod, TileLayerMod, VectorLayerMod, VectorSourceMod,
          OSMMod, StyleMod, CircleStyleMod, FillMod, StrokeMod,
          FeatureMod, PointMod, fromLonLatMod,
        ] = await Promise.all([
          import('ol/Map'), import('ol/View'), import('ol/layer/Tile'),
          import('ol/layer/Vector'), import('ol/source/Vector'),
          import('ol/source/OSM'), import('ol/style/Style'),
          import('ol/style/Circle'), import('ol/style/Fill'),
          import('ol/style/Stroke'), import('ol/Feature'),
          import('ol/geom/Point'), import('ol/proj'),
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

        if (cancelled || !mapRef.current) return

        const features = soundings.map((point) => {
          const feature = new Feature({
            geometry: new Point(fromLonLat([point.easting, point.northing])),
          })
          feature.setStyle(new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color: getDepthColor(point.depth, minDepth, maxDepth) }),
              stroke: new Stroke({ color: '#fff', width: 1 }),
            }),
          }))
          feature.set('depth', point.depth)
          return feature
        })

        const vectorSource = new VectorSource({ features })
        const vectorLayer = new VectorLayer({ source: vectorSource })

        const map = new Map({
          target: mapRef.current,
          layers: [
            new TileLayer({ source: new OSM() }),
            vectorLayer,
          ],
          view: new View({
            center: soundings.length > 0
              ? fromLonLat([
                  soundings.reduce((sum, s) => sum + s.easting, 0) / soundings.length,
                  soundings.reduce((sum, s) => sum + s.northing, 0) / soundings.length,
                ])
              : fromLonLat([0, 0]),
            zoom: 15,
          }),
        })

        // Fit to features
        if (features.length > 0) {
          const extent = vectorSource.getExtent()
          map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 18 })
        }

        mapInstance.current = map
      } catch (err) {
        console.error('BathymetryMap init failed:', err)
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapInstance.current) mapInstance.current.setTarget(undefined)
    }
  }, [soundings, minDepth, maxDepth])

  return (
    <div ref={mapRef} className="rounded-lg" style={{ height, width: '100%' }} />
  )
}
