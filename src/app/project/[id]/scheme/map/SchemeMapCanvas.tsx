'use client'

import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import { fromLonLat } from 'ol/proj'
import { Style, Fill, Stroke, Text } from 'ol/style'
import CircleStyle from 'ol/style/Circle'
import Overlay from 'ol/Overlay'
import type { FeatureLike } from 'ol/Feature'
import { registerProjections, SRID_21037 } from '@/lib/map/projection'

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  field_complete: '#3b82f6',
  computed: '#22c55e',
  plan_generated: '#f59e0b',
  submitted: '#8b5cf6',
  approved: '#10b981',
}

interface SchemeMapCanvasProps {
  projectId: string
  onReady: (parcelCount: number) => void
  onError: (message: string) => void
}

export default function SchemeMapCanvas({ projectId, onReady, onError }: SchemeMapCanvasProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || !projectId) return

    registerProjections()
    const controller = new AbortController()
    const vectorSource = new VectorSource()
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maxZoom: 19,
            crossOrigin: 'anonymous',
          }),
        }),
        new VectorLayer({
          source: vectorSource,
          style: (feature: FeatureLike) => {
            const props = feature.getProperties()
            const status = (props.status as string) || 'pending'
            const color = STATUS_COLORS[status] || '#6b7280'
            const geometryType = feature.getGeometry()?.getType()

            if (geometryType === 'Polygon') {
              return new Style({
                fill: new Fill({ color: `${color}40` }),
                stroke: new Stroke({ color, width: 2.5 }),
                text: new Text({
                  text: String(props.parcel_number || ''),
                  font: 'bold 12px sans-serif',
                  fill: new Fill({ color: '#ffffff' }),
                  stroke: new Stroke({ color: '#000000', width: 3 }),
                }),
              })
            }

            if (geometryType === 'Point' && props.type === 'block_label') {
              return new Style({
                text: new Text({
                  text: `Block ${String(props.block_number ?? '')}\n(${String(props.parcel_count ?? '')} parcels)`,
                  font: 'bold 14px sans-serif',
                  fill: new Fill({ color: '#1e40af' }),
                  stroke: new Stroke({ color: '#ffffff', width: 4 }),
                  textAlign: 'center',
                }),
              })
            }

            return new Style({
              image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color }),
                stroke: new Stroke({ color: '#000000', width: 1 }),
              }),
            })
          },
        }),
      ],
      view: new View({ center: fromLonLat([37.0, -1.3]), zoom: 15 }),
    })

    const overlay = new Overlay({ element: popupRef.current || undefined, autoPan: true })
    map.addOverlay(overlay)
    map.on('click', event => {
      const feature = map.forEachFeatureAtPixel(event.pixel, item => item)
      const element = popupRef.current
      if (!feature || !element) {
        if (element) element.style.display = 'none'
        return
      }

      const props = feature.getProperties()
      element.replaceChildren()
      const wrap = document.createElement('div')
      wrap.style.cssText = 'font-size:12px;'
      const title = document.createElement('strong')
      title.textContent = `Block ${String(props.block_number ?? '')} — Parcel ${String(props.parcel_number || '')}`
      wrap.append(title, document.createElement('br'))
      if (props.lr_number) {
        const row = document.createElement('div')
        row.textContent = `LR: ${String(props.lr_number)}`
        wrap.append(row)
      }
      if (props.area_ha) {
        const row = document.createElement('div')
        row.textContent = `Area: ${Number(props.area_ha).toFixed(4)} ha`
        wrap.append(row)
      }
      const statusRow = document.createElement('div')
      const statusSpan = document.createElement('span')
      statusSpan.style.color = STATUS_COLORS[props.status as string] || '#999'
      statusSpan.textContent = String(props.status || 'pending')
      statusRow.append(document.createTextNode('Status: '), statusSpan)
      wrap.append(statusRow)
      element.append(wrap)
      element.style.display = 'block'
      overlay.setPosition(event.coordinate)
    })

    fetch(`/api/scheme/map?project_id=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Failed to load scheme data')
        return response.json() as Promise<{ features?: unknown[] }>
      })
      .then(data => {
        if (data.features && data.features.length > 0) {
          const format = new GeoJSON()
          const features = format.readFeatures(data, {
            dataProjection: SRID_21037,
            featureProjection: 'EPSG:3857',
          })
          vectorSource.addFeatures(features)
          const parcelCount = features.filter(feature => feature.getGeometry()?.getType() === 'Polygon').length
          onReady(parcelCount)
          const extent = vectorSource.getExtent()
          if (extent && extent[0] !== Infinity) map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 18 })
        } else {
          onReady(0)
        }
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return
        onError('Failed to load scheme data')
      })

    return () => {
      controller.abort()
      map.setTarget(undefined)
    }
  }, [projectId, onReady, onError])

  return (
    <>
      <div ref={mapRef} className="w-full h-full" />
      <div ref={popupRef} className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl" style={{ display: 'none', minWidth: 200 }} />
      <div className="absolute bottom-4 right-4 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-400 mb-2">STATUS LEGEND</h4>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-300 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </>
  )
}
