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

const PAPER_LAYER_COLORS: Record<string, string> = { CONTOURS: '#97704a', CONTOUR_I: '#70411e', GRID: '#d7dde2', PLAN_LEADERS: '#78828a', SURVEY_BREAKLINES_3D: '#1c6778', TERRAIN_EXCLUSIONS: '#a13636' }

interface TopoEntityCanvasProps {
  entities: DrawingEntity[]
  layers: DrawingLayerInfo[]
  extents: Extents
  width?: number
  height?: number
  /** Layer names to hide. */
  hiddenLayers?: Set<string>
  initialPaperView?: boolean
  surveyFrame?: Extents
  emptyMessage?: string
}

export function TopoEntityCanvas({
  entities,
  layers,
  extents,
  width = 900,
  height = 560,
  hiddenLayers,
  initialPaperView = false,
  surveyFrame,
  emptyMessage = 'Import points to see the drawing preview',
}: TopoEntityCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const view = useRef<{ stage: Konva.Stage; scene: Konva.Group; points: Konva.Group; fit: { scale: number; x: number; y: number } } | null>(null)
  const [focusSurvey, setFocusSurvey] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [paperView, setPaperView] = useState(initialPaperView)
  const [showPointLabels, setShowPointLabels] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [showLeaders, setShowLeaders] = useState(true)
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
    // Keep symbols screen-sized while coordinates and annotations zoom.
    for (const marker of current.points.getChildren()) { const circle = marker as Konva.Circle; circle.radius(3.5 / (fit.scale * factor)); circle.strokeWidth(1.5 / (fit.scale * factor)) }
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
  const canvasWidth = Math.max(1, initialPaperView ? (availableWidth ?? width) : Math.min(width, availableWidth ?? width))
  const layerColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of layers) m.set(l.name, l.colorHex)
    return m
  }, [layers])

  useEffect(() => {
    if (!containerRef.current) return
    const width = canvasWidth
    containerRef.current.querySelector('.konvajs-content')?.remove()

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

    const pointGroup = new Konva.Group()
    for (const e of entities) {
      if (hiddenLayers?.has(e.layer) || (!showPointLabels && e.layer === 'POINT_LABELS') || (!showLeaders && e.layer === 'PLAN_LEADERS') || (!showGrid && e.layer === 'GRID')) continue
      const color = paperView ? (PAPER_LAYER_COLORS[e.layer] ?? '#25313d') : (layerColorMap.get(e.layer) ?? '#d4d4d8')
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
            stroke: color, strokeWidth: e.layer === 'CONTOUR_I' ? 1.8 : e.layer === 'CONTOURS' ? 0.75 : 1.1,
            closed: e.kind === 'polyline' && !!e.closed, listening: false,
          }))
          break
        }
        case 'point':
          pointGroup.add(new Konva.Circle({ name: 'survey-point', x: toX(e.e), y: toY(e.n), radius: 3.5, fill: paperView ? '#184d61' : color, stroke: paperView ? '#ffffff' : '#111827', strokeWidth: 1.5, listening: false }))
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

    // Draw observations above linework so contours cannot obscure a measured point.
    scene.add(pointGroup)
    // Fit the actual rendered bounds, including title/reference text outside
    // the neatline. Survey coordinates and the neatline clip remain unchanged.
    const content = focusSurvey && surveyFrame ? { x: toX(surveyFrame.minX), y: toY(surveyFrame.maxY), width: (surveyFrame.maxX-surveyFrame.minX)*scale, height: (surveyFrame.maxY-surveyFrame.minY)*scale } : scene.getClientRect({ skipTransform: true })
    if (content.width > 0 && content.height > 0) {
      const fit = Math.min(focusSurvey ? 8 : 1, Math.max(1, width - padding * 2) / content.width, Math.max(1, height - padding * 2) / content.height)
      scene.scale({ x: fit, y: fit })
      scene.position({ x: (width - content.width * fit) / 2 - content.x * fit, y: (height - content.height * fit) / 2 - content.y * fit })
    }
    view.current = { stage, scene, points: pointGroup, fit: { scale: scene.scaleX(), x: scene.x(), y: scene.y() } }
    // Marker diameter stays readable after fitting large sheets or narrow phones.
    const markerScale = scene.scaleX()
    for (const marker of pointGroup.getChildren()) { const circle = marker as Konva.Circle; circle.radius(3.5 / markerScale); circle.strokeWidth(1.5 / markerScale) }
    setZoom(1)
    layer.draw()
    return () => { if (view.current?.stage === stage) view.current = null; stage.destroy() }
  }, [entities, layers, extents, layerColorMap, hiddenLayers, canvasWidth, height, emptyMessage, paperView, showPointLabels, showGrid, showLeaders, focusSurvey, surveyFrame])

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-sm text-zinc-300">
        <p>{entities.filter(entity => entity.kind === 'point').length} point markers · Zoom to inspect labels. Drag to pan.</p>
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Map presentation">
          <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={paperView} onChange={event => setPaperView(event.target.checked)} />Paper view</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={showPointLabels} onChange={event => setShowPointLabels(event.target.checked)} />Point labels</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={showLeaders} onChange={event => setShowLeaders(event.target.checked)} />Leader lines</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />Coordinate grid</label>
        </div>
        <div role="group" aria-label="Drawing view" className="flex flex-wrap items-center gap-1">
          <button type="button" aria-label="Zoom out drawing" disabled={zoom === 1} onClick={() => changeZoom(zoom / 1.5)} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"><ZoomOut className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" aria-label="Zoom in drawing" disabled={zoom === 8} onClick={() => changeZoom(zoom * 1.5)} className="flex min-h-11 min-w-11 items-center justify-center rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40"><ZoomIn className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => { setFocusSurvey(false); changeZoom(1) }} className="inline-flex min-h-11 items-center gap-2 rounded border border-zinc-700 px-3 hover:bg-zinc-800"><Maximize2 className="h-4 w-4" aria-hidden="true" />Fit drawing</button>{surveyFrame && <button type="button" onClick={() => { setFocusSurvey(true); changeZoom(1) }} className="min-h-11 rounded border border-zinc-700 px-3 hover:bg-zinc-800">Fit survey area</button>}
        </div>
      </div>
      <p className="px-3 py-2 text-xs text-zinc-400">View controls affect this preview. Downloads retain the complete saved drawing and its reference annotations.</p>
      <div ref={containerRef} className={paperView ? "bg-white [&>.konvajs-content]:mx-auto" : "bg-zinc-950 [&>.konvajs-content]:mx-auto"} role="img" aria-label="Topographic drawing preview, including draft and reference annotations" style={{ width: '100%', height, touchAction: zoom > 1 ? 'none' : 'pan-y' }} />
    </div>
  )
}

export default TopoEntityCanvas
