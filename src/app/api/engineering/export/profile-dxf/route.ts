import { NextRequest, NextResponse } from 'next/server'
import Drawing from 'dxf-writer'
import { initialiseDXFLayers, DXF_LAYERS } from '@/lib/drawing/dxfLayers'

export async function POST(req: NextRequest) {
  try {
    const { points, title, projectId } = await req.json()

    const drawing = new Drawing()
    initialiseDXFLayers(drawing)

    const minCh = Math.min(...points.map((p: any) => p.chainage))
    const minGL = Math.min(...points.map((p: any) => p.groundLevel))

    // Scale: 1:2000 horizontal, 1:200 vertical → 10x vertical exaggeration
    const hScale = 1 / 2000
    const vScale = 1 / 200

    // Ground profile
    drawing.setActiveLayer(DXF_LAYERS.PROFILE.name)
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      drawing.drawLine(
        (p1.chainage - minCh) * hScale,
        (p1.groundLevel - minGL) * vScale,
        (p2.chainage - minCh) * hScale,
        (p2.groundLevel - minGL) * vScale
      )
    }

    // Formation line
    const formPoints = points.filter((p: any) => p.formationLevel != null)
    if (formPoints.length >= 2) {
      drawing.setActiveLayer(DXF_LAYERS.CENTRELINE.name)
      for (let i = 0; i < formPoints.length - 1; i++) {
        const p1 = formPoints[i]
        const p2 = formPoints[i + 1]
        drawing.drawLine(
          (p1.chainage - minCh) * hScale,
          (p1.formationLevel - minGL) * vScale,
          (p2.chainage - minCh) * hScale,
          (p2.formationLevel - minGL) * vScale
        )
      }
    }

    // Chainage annotations
    drawing.setActiveLayer(DXF_LAYERS.CHAINAGES.name)
    points.forEach((p: any) => {
      drawing.drawText(
        (p.chainage - minCh) * hScale,
        -0.005,
        0.002,
        0,
        `${p.chainage.toFixed(0)}`
      )
    })

    return new NextResponse(drawing.toDxfString(), {
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="profile_${projectId}.dxf"`
      }
    })
  } catch (error) {
    return NextResponse.json({ error: 'DXF export failed' }, { status: 500 })
  }
}
