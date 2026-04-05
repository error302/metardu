import { NextRequest, NextResponse } from 'next/server'
import Drawing from 'dxf-writer'
import {
  initialiseDXFLayers,
  DXF_LAYERS
} from '@/lib/drawing/dxfLayers'
import type { ContourLine } from '@/lib/topo/contourGenerator'

export async function POST(req: NextRequest) {
  try {
    const { projectId, contours, spotHeights } = await req.json()

    const drawing = new Drawing()
    initialiseDXFLayers(drawing)

    contours.forEach((contour: ContourLine) => {
      const layerName = contour.isIndex
        ? DXF_LAYERS.CONTOURS_IDX.name
        : DXF_LAYERS.CONTOURS.name

      drawing.setActiveLayer(layerName)

      contour.coordinates.forEach((ring: [number, number][]) => {
        for (let i = 0; i < ring.length - 1; i++) {
          drawing.drawLine(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1])
        }
        if (ring.length > 1) {
          drawing.drawLine(ring[ring.length - 1][0], ring[ring.length - 1][1], ring[0][0], ring[0][1])
        }

        if (contour.isIndex && ring.length > 4) {
          const mid = ring[Math.floor(ring.length / 4)]
          drawing.drawText(mid[0], mid[1], 0.5, 0, `${contour.elevation.toFixed(1)}`)
        }
      })
    })

    drawing.setActiveLayer(DXF_LAYERS.SPOT_HEIGHTS.name)
    spotHeights.forEach((pt: { e: number; n: number; z: number; label?: string }) => {
      drawing.drawCircle(pt.e, pt.n, 0.2)
      drawing.drawText(pt.e + 0.3, pt.n + 0.3, 0.4, 0, pt.z.toFixed(2))
    })

    const dxfString = drawing.toDxfString()

    return new NextResponse(dxfString, {
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="topo_${projectId}.dxf"`
      }
    })
  } catch (error) {
    return NextResponse.json({ error: 'DXF generation failed' }, { status: 500 })
  }
}
