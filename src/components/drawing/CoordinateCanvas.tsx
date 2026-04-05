'use client'

import { useEffect, useRef } from 'react'
import Konva from 'konva'

export interface CanvasPoint {
  id: string
  name: string
  easting: number
  northing: number
  type: 'beacon' | 'control' | 'spot_height' | 'setting_out'
}

export interface CanvasLine {
  from: string
  to: string
  style?: 'solid' | 'dashed'
}

export interface CoordinateCanvasProps {
  points: CanvasPoint[]
  lines?: CanvasLine[]
  width?: number
  height?: number
  showNorthArrow?: boolean
  showScaleBar?: boolean
  showGrid?: boolean
  onPointClick?: (point: CanvasPoint) => void
}

interface Transform {
  scale: number
  originE: number
  originN: number
}

function computeTransform(
  points: CanvasPoint[],
  canvasWidth: number,
  canvasHeight: number,
  padding = 60
): Transform {
  if (points.length === 0) {
    return { scale: 1, originE: 0, originN: 0 }
  }

  const eastings = points.map(p => p.easting)
  const northings = points.map(p => p.northing)

  const minE = Math.min(...eastings)
  const maxE = Math.max(...eastings)
  const minN = Math.min(...northings)
  const maxN = Math.max(...northings)

  const rangeE = maxE - minE || 1
  const rangeN = maxN - minN || 1

  const availW = canvasWidth - padding * 2
  const availH = canvasHeight - padding * 2

  const scale = Math.min(availW / rangeE, availH / rangeN)

  const originE = minE - (availW / scale - rangeE) / 2 - padding / scale
  const originN = maxN + (availH / scale - rangeN) / 2 + padding / scale

  return { scale, originE, originN }
}

function worldToCanvas(
  e: number,
  n: number,
  t: Transform,
  canvasHeight: number
): { x: number; y: number } {
  return {
    x: (e - t.originE) * t.scale,
    y: canvasHeight - (n - t.originN) * t.scale
  }
}

export function CoordinateCanvas({
  points,
  lines = [],
  width = 800,
  height = 600,
  showNorthArrow = true,
  showScaleBar = true,
  showGrid = false,
  onPointClick
}: CoordinateCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const existing = containerRef.current.querySelector('.konva-container')
    if (existing) existing.remove()

    const stage = new Konva.Stage({
      container: containerRef.current,
      width,
      height
    })

    const layer = new Konva.Layer()
    stage.add(layer)

    if (points.length === 0) {
      const text = new Konva.Text({
        x: width / 2 - 80,
        y: height / 2,
        text: 'No survey points yet',
        fontSize: 14,
        fill: '#666'
      })
      layer.add(text)
      layer.draw()
      return () => stage.destroy()
    }

    const t = computeTransform(points, width, height)
    const pointMap = new Map(points.map(p => [p.id, p]))

    if (showGrid) {
      const gridGroup = new Konva.Group()
      const gridInterval = 100
      const minE = Math.min(...points.map(p => p.easting)) - 200
      const maxE = Math.max(...points.map(p => p.easting)) + 200
      const minN = Math.min(...points.map(p => p.northing)) - 200
      const maxN = Math.max(...points.map(p => p.northing)) + 200

      for (let e = Math.ceil(minE / gridInterval) * gridInterval; e <= maxE; e += gridInterval) {
        const start = worldToCanvas(e, minN, t, height)
        const end = worldToCanvas(e, maxN, t, height)
        gridGroup.add(new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: '#333',
          strokeWidth: 0.5,
          dash: [4, 4]
        }))
      }

      for (let n = Math.ceil(minN / gridInterval) * gridInterval; n <= maxN; n += gridInterval) {
        const start = worldToCanvas(minE, n, t, height)
        const end = worldToCanvas(maxE, n, t, height)
        gridGroup.add(new Konva.Line({
          points: [start.x, start.y, end.x, end.y],
          stroke: '#333',
          strokeWidth: 0.5,
          dash: [4, 4]
        }))
      }
      layer.add(gridGroup)
    }

    lines.forEach(line => {
      const from = pointMap.get(line.from)
      const to = pointMap.get(line.to)
      if (!from || !to) return

      const fromCanvas = worldToCanvas(from.easting, from.northing, t, height)
      const toCanvas = worldToCanvas(to.easting, to.northing, t, height)

      const midX = (fromCanvas.x + toCanvas.x) / 2
      const midY = (fromCanvas.y + toCanvas.y) / 2

      layer.add(new Konva.Line({
        points: [fromCanvas.x, fromCanvas.y, toCanvas.x, toCanvas.y],
        stroke: '#e8a020',
        strokeWidth: 1.5,
        dash: line.style === 'dashed' ? [8, 4] : undefined
      }))

      const dE = to.easting - from.easting
      const dN = to.northing - from.northing
      const dist = Math.sqrt(dE * dE + dN * dN)

      const angle = Math.atan2(toCanvas.y - fromCanvas.y, toCanvas.x - fromCanvas.x)
      const angleDeg = angle * (180 / Math.PI)

      layer.add(new Konva.Text({
        x: midX,
        y: midY - 10,
        text: `${dist.toFixed(3)}m`,
        fontSize: 10,
        fill: '#aaa',
        rotation: angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg
      }))
    })

    points.forEach(pt => {
      const { x, y } = worldToCanvas(pt.easting, pt.northing, t, height)
      const r = 5

      const symbolColor: Record<string, string> = {
        beacon: '#e8a020',
        control: '#4a9eff',
        spot_height: '#66cc66',
        setting_out: '#cc66ff'
      }

      const circle = new Konva.Circle({
        x, y, radius: r,
        stroke: symbolColor[pt.type] || '#e8a020',
        strokeWidth: 1.5,
        fill: 'transparent'
      })

      const crossH = new Konva.Line({
        points: [x - r, y, x + r, y],
        stroke: symbolColor[pt.type] || '#e8a020',
        strokeWidth: 1
      })
      const crossV = new Konva.Line({
        points: [x, y - r, x, y + r],
        stroke: symbolColor[pt.type] || '#e8a020',
        strokeWidth: 1
      })

      const label = new Konva.Text({
        x: x + r + 3,
        y: y - 6,
        text: pt.name,
        fontSize: 11,
        fill: '#fff',
        fontStyle: 'bold'
      })

      const hitCircle = new Konva.Circle({
        x, y, radius: 12,
        fill: 'transparent'
      })
      hitCircle.on('click tap', () => onPointClick?.(pt))
      hitCircle.on('mouseenter', () => {
        stage.container().style.cursor = 'pointer'
      })
      hitCircle.on('mouseleave', () => {
        stage.container().style.cursor = 'default'
      })

      layer.add(circle, crossH, crossV, label, hitCircle)
    })

    if (showNorthArrow) {
      const naX = width - 40
      const naY = 50
      layer.add(new Konva.Arrow({
        points: [naX, naY + 25, naX, naY],
        pointerLength: 8,
        pointerWidth: 6,
        fill: '#fff',
        stroke: '#fff',
        strokeWidth: 1.5
      }))
      layer.add(new Konva.Text({
        x: naX - 4,
        y: naY - 16,
        text: 'N',
        fontSize: 13,
        fill: '#fff',
        fontStyle: 'bold'
      }))
    }

    if (showScaleBar) {
      const sbX = 20
      const sbY = height - 30
      const targetPixels = 80
      const worldLength = targetPixels / t.scale
      const roundLength = Math.pow(10, Math.round(Math.log10(worldLength)))
      const barPixels = roundLength * t.scale

      layer.add(new Konva.Line({
        points: [sbX, sbY, sbX + barPixels, sbY],
        stroke: '#fff',
        strokeWidth: 2
      }))
      layer.add(new Konva.Line({
        points: [sbX, sbY - 4, sbX, sbY + 4],
        stroke: '#fff', strokeWidth: 2
      }))
      layer.add(new Konva.Line({
        points: [sbX + barPixels, sbY - 4, sbX + barPixels, sbY + 4],
        stroke: '#fff', strokeWidth: 2
      }))
      layer.add(new Konva.Text({
        x: sbX,
        y: sbY + 6,
        text: roundLength >= 1000 ? `${roundLength / 1000}km` : `${roundLength}m`,
        fontSize: 10,
        fill: '#aaa'
      }))
    }

    layer.draw()

    return () => {
      stage.destroy()
    }
  }, [points, lines, width, height, showNorthArrow, showScaleBar, showGrid, onPointClick])

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden bg-[#111]"
      style={{ width, height }}
    />
  )
}
