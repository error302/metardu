'use client'
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import {
  createSchemeLayers,
  type SchemeViewportStatus,
} from '@/lib/map/schemeLayer'
import type { OLMap } from '@/lib/map/olTypes'
export default function SchemeMapCanvas({
  projectId,
  onStatus,
  onError,
}: {
  projectId: string
  onStatus: (status: SchemeViewportStatus) => void
  onError: (message: string) => void
}) {
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!target.current) return
    const controller = new AbortController()
    let disposed = false,
      cleanup: (() => void) | null = null
    const map = new Map({
      target: target.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maxZoom: 19,
            crossOrigin: 'anonymous',
            attributions: '© OpenStreetMap contributors',
          }),
        }),
      ],
      view: new View({ center: [0, 0], zoom: 2 }),
    })
    void (async () => {
      try {
        const result = await createSchemeLayers(
          projectId,
          map as unknown as OLMap,
          {
            autoZoom: true,
            signal: controller.signal,
            onViewportStatus: (status) => {
              if (!disposed) onStatus(status)
            },
          },
        )
        if (disposed) result.cleanup()
        else cleanup = result.cleanup
      } catch (failure) {
        if (!disposed && !controller.signal.aborted)
          onError(
            failure instanceof Error
              ? failure.message
              : 'Stored geometry could not be loaded.',
          )
      }
    })()
    return () => {
      disposed = true
      controller.abort()
      cleanup?.()
      map.setTarget(undefined)
    }
  }, [projectId, onStatus, onError])
  return (
    <div
      ref={target}
      className="h-full min-h-80 w-full"
      aria-label="Stored parcel geometry map"
    />
  )
}
