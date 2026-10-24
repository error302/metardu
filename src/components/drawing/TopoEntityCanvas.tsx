'use client';

/**
 * TopoEntityCanvas — renders a shared DrawingEntity[] (from buildTopoEntities)
 * to Konva with neatline clipping to ensure no contours or grid lines bleed
 * outside the drawing sheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
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
    const scale = Math.min((width - padding * 2) / worldW, (height - padding * 2) / worldH)

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

    // Text heights are in world units → convert to px, clamp for legibility
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
          const fs = Math.max(6, Math.min(12, e.height * textScale))
          targetContainer.add(new Konva.Text({
            x: toX(e.e), y: toY(e.n),
            text: e.text, fontSize: fs, fill: color, listening: false,
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
    layer.draw()
    return () => stage.destroy()
  }, [entities, layers, extents, layerColorMap, hiddenLayers, canvasWidth, height, emptyMessage])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Topographic drawing preview, including draft and reference annotations"
      className="rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800"
      style={{ width: '100%', height }}
    />
  )
}

export default TopoEntityCanvas
