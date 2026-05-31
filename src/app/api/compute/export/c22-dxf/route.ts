import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'

import Drawing from 'dxf-writer'
import { initialiseDXFLayers, DXF_LAYERS } from '@/lib/drawing/dxfLayers'

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const pointSchema = z.object({
  name: z.string().min(1),
  easting: z.number(),
  northing: z.number(),
  is_control: z.boolean().optional().default(false),
})

const legSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  bearing: z.number(),
  distance: z.number(),
})

const c22DxfRequestSchema = z.object({
  projectName: z.string().min(1),
  lrNumber: z.string().optional().default(''),
  points: z.array(pointSchema),
  traverseLegs: z.array(legSchema).optional().default([]),
})

// ---------------------------------------------------------------------------
// POST — generate C22 DXF
// ---------------------------------------------------------------------------

export const POST = apiHandler(
  { auth: true, schema: c22DxfRequestSchema },
  async (_req, ctx) => {
    const body = ctx.body as z.infer<typeof c22DxfRequestSchema>
    const { points, traverseLegs } = body

    // -----------------------------------------------------------------------
    // Create DXF drawing
    // -----------------------------------------------------------------------

    const drawing = new Drawing()
    initialiseDXFLayers(drawing)
    drawing.setUnits('Meters')

    // Add TEXT layer (not in standard DXF_LAYERS set)
    drawing.addLayer('TEXT', 7, 'CONTINUOUS')

    const byName = new Map(points.map((p) => [p.name, p] as const))

    // -----------------------------------------------------------------------
    // Draw traverse lines on TRAVERSE layer
    // -----------------------------------------------------------------------

    if (traverseLegs.length > 0) {
      drawing.setActiveLayer(DXF_LAYERS.TRAVERSE.name)
      for (const leg of traverseLegs) {
        const from = byName.get(leg.from)
        const to = byName.get(leg.to)
        if (from && to) {
          drawing.drawLine(from.easting, from.northing, to.easting, to.northing)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Draw boundary polygon on BOUNDARY layer
    // -----------------------------------------------------------------------

    if (points.length >= 3) {
      drawing.setActiveLayer(DXF_LAYERS.BOUNDARY.name)
      for (let i = 0; i < points.length; i++) {
        const curr = points[i]
        const next = points[(i + 1) % points.length]
        drawing.drawLine(curr.easting, curr.northing, next.easting, next.northing)
      }
    }

    // -----------------------------------------------------------------------
    // Draw control points on CONTROL_POINTS layer
    // -----------------------------------------------------------------------

    for (const p of points) {
      if (p.is_control) {
        drawing.setActiveLayer(DXF_LAYERS.CONTROL_POINTS.name)
        drawing.drawPoint(p.easting, p.northing)
        // Draw a small crosshair for control points
        const size = 2
        drawing.drawLine(p.easting - size, p.northing, p.easting + size, p.northing)
        drawing.drawLine(p.easting, p.northing - size, p.easting, p.northing + size)
      }
    }

    // -----------------------------------------------------------------------
    // Draw labels on TEXT layer
    // -----------------------------------------------------------------------

    drawing.setActiveLayer('TEXT')
    for (const p of points) {
      drawing.drawText(p.easting + 0.5, p.northing + 0.5, 1.5, 0, p.name)
    }

    // -----------------------------------------------------------------------
    // Return DXF string
    // -----------------------------------------------------------------------

    const dxf = drawing.toDxfString()
    const safeName = body.projectName.replace(/\s+/g, '_')
    const filename = body.lrNumber
      ? `${safeName}_${body.lrNumber}.dxf`
      : `${safeName}.dxf`

    return NextResponse.json({
      dxf,
      filename,
    })
  }
)

// ---------------------------------------------------------------------------
// GET — endpoint metadata
// ---------------------------------------------------------------------------

export const GET = apiHandler({ auth: true }, async () => {
  return NextResponse.json({
    endpoint: '/api/compute/export/c22-dxf',
    description: 'Generate a DXF from traverse computation data with BOUNDARY, CONTROL_POINTS, TRAVERSE, and TEXT layers.',
    python_required: false,
  })
})
