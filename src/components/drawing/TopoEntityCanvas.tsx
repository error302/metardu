'use client';

/**
 * TopoEntityCanvas — renders a shared DrawingEntity[] (from buildTopoEntities)
 * to Konva with neatline clipping to ensure no contours or grid lines bleed
 * outside the drawing sheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { DrawingEntity, DrawingLayerInfo, Extents } from '@/lib/drawing/topoEntities'

interface TopoEntityCanvasProps {
  entities: DrawingEntity[]
  layers: DrawingLayerInfo[]
  extents: Extents
  width?: number
  height?: number
  /** Layer names to hide. */
  hiddenLayers?: Set<string>
  emptyMessage?: string
}

export function TopoEntityCanvas({
  entities,
  layers,
  extents,
  width = 900,
  height = 560,
  hiddenLayers,
  emptyMessage = 'Import points to see the drawing preview',
}: TopoEntityCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const view = useRef<{ stage: Konva.Stage; scene: Konva.Group; fit: { scale: number; x: number; y: number } } | null>(null)
  const [zoom, setZoom] = useState(1)
  const changeZoom = (requested: number) => {
    const current = view.current
    if (!current) return
    const factor = Math.max(1, Math.min(8, requested))
    const { stage, scene, fit } = current
    if (factor === 1) { stage.position({ x: 0, y: 0 }); scene.scale({ x: fit.scale, y: fit.scale }); scene.position({ x: fit.x, y: fit.y }) }
    else {
      const centre = { x: stage.width() / 2, y: stage.height() / 2 }
      const point = { x: (centre.x - scene.x() - stage.x()) / scene.scaleX(), y: (centre.y - scene.y() - stage.y()) / scene.scaleY() }
      const next = fit.scale * factor
      stage.position({ x: 0, y: 0 }); scene.scale({ x: next, y: next }); scene.position({ x: centre.x - point.x * next, y: centre.y - point.y * next })
    }
    stage.draggable(factor > 1); stage.batchDraw(); setZoom(factor)
  }
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => setAvailableWidth(container.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  const canvasWidth = Math.max(1, Math.min(width, availableWidth ?? width))
  const layerColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of layers) m.set(l.name, l.colorHex)
    return m
  }, [layers])

  useEffect(() => {
    if (!containerRef.current) return
    const width = canvasWidth
    containerRef.current.querySelector('.konva-container')?.remove()

    const stage = new Konva.Stage({ container: containerRef.current, width, height })
    const layer = new Konva.Layer()
    stage.add(layer)
    const scene = new Konva.Group()
    layer.add(scene)

    const worldW = extents.maxX - extents.minX || 1
    const worldH = extents.maxY - extents.minY || 1
    const padding = 24
    const scale = Math.min(Math.max(1, width - padding * 2) / worldW, Math.max(1, height - padding * 2) / worldH)

    // Centre the drawing in the canvas
    const offX = (width - worldW * scale) / 2
    const offY = (height - worldH * scale) / 2

    const toX = (e: number) => offX + (e - extents.minX) * scale
    const toY = (n: number) => height - (offY + (n - extents.minY) * scale)

    if (entities.length === 0) {
      layer.add(new Konva.Text({
        x: width / 2 - 120, y: height / 2,
        text: emptyMessage, fontSize: 14, fill: '#71717a',
      }))
      layer.draw()
      return () => { stage.destroy() }
    }

    // Neatline clipping group to prevent contour bleeding
    const inset = worldW * 0.01
    const neatMinX = toX(extents.minX + inset)
    const neatMaxX = toX(extents.maxX - inset)
    const neatMinY = toY(extents.maxY - inset)
    const neatMaxY = toY(extents.minY + inset)

    const clippedGroup = new Konva.Group({
      clip: {
        x: Math.min(neatMinX, neatMaxX),
        y: Math.min(neatMinY, neatMaxY),
        width: Math.abs(neatMaxX - neatMinX),
        height: Math.abs(neatMaxY - neatMinY),
      },
    })
    scene.add(clippedGroup)

    // Preserve DXF text scale and baseline. Zoom the complete drawing to inspect it.
    const textScale = scale

    for (const e of entities) {
      if (hiddenLayers?.has(e.layer)) continue
      const color = layerColorMap.get(e.layer) ?? '#d4d4d8'
      const targetContainer = (e.layer === 'CONTOURS' || e.layer === 'CONTOUR_I' || e.layer === 'GRID')
        ? clippedGroup
        : scene

      switch (e.kind) {
        case 'line':
          targetContainer.add(new Konva.Line({
            points: [toX(e.x1), toY(e.y1), toX(e.x2), toY(e.y2)],
            stroke: color, strokeWidth: e.layer === 'GRID' ? 0.6 : 1, listening: false,
          }))
          break
        case 'polyline':
        case 'polyline3d': {
          const flat: number[] = []
          for (const [en, nn] of e.pts) flat.push(toX(en), toY(nn))
          targetContainer.add(new Konva.Line({
            points: flat,
            stroke: color, strokeWidth: 1.1,
            closed: e.kind === 'polyline' && !!e.closed, listening: false,
          }))
          break
        }
        case 'point':
          targetContainer.add(new Konva.Circle({ x: toX(e.e), y: toY(e.n), radius: 1.6, fill: color, listening: false }))
          break
        case 'text': {
          const fs = Math.max(0.01, e.height * textScale)
          targetContainer.add(new Konva.Text({
            x: toX(e.e), y: toY(e.n), offsetY: fs, rotation: -(e.rotation ?? 0),
            text: e.text, fontSize: fs, fontFamily: 'monospace', fill: color, listening: false,
          }))
          break
        }
      }
    }

    // Fit the actual rendered bounds, including title/reference text outside
    // the neatline. Survey coordinates and the neatline clip remain unchanged.
    const content = scene.getClientRect({ skipTransform: true })
    if (content.width > 0 && content.height > 0) {
      const fit = Math.min(1, Math.max(1, width - padding * 2) / content.width, Math.max(1, height - padding * 2) / content.height)
      scene.scale({ x: fit, y: fit })
      scene.position({ x: (width - content.width * fit) / 2 - content.x * fit, y: (height - content.height * fit) / 2 - content.y * fit })
    }
    view.current = { stage, scene, fit: { scale: scene.scaleX(), x: scene.x(), y: scene.y() } }
    setZoom(1)
    layer.draw()
    return () => { if (view.current?.stage === stage) view.current = null; stage.destroy() }
  }, [entities, layers, extents, layerColorMap, hiddenLayers, canvasWidth, height, emptyMessage])

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-sm text-zinc-300">
        <p>Zoom to inspect labels. Drag to pan.</p>
        <div role="group" aria-label="Drawing view" className="flex items-center gap-1">
          <button type="button" aria-label="Zoom out drawing" disabled={zoom === 1} onClick={() => changeZoom(zoom / 1.5)} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"><ZoomOut className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" aria-label="Zoom in drawing" disabled={zoom === 8} onClick={() => changeZoom(zoom * 1.5)} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"><ZoomIn className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => changeZoom(1)} className="inline-flex min-h-11 items-center gap-2 rounded border border-zinc-700 px-3 hover:bg-zinc-800"><Maximize2 className="h-4 w-4" aria-hidden="true" />Fit drawing</button>
        </div>
      </div>
      <div ref={containerRef} className="[&>.konva-container]:mx-auto" role="img" aria-label="Topographic drawing preview, including draft and reference annotations" style={{ width: '100%', height, touchAction: zoom > 1 ? 'none' : 'pan-y' }} />
    </div>
  )
}

export default TopoEntityCanvas
