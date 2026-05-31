import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'

const computeRequestSchema = z.object({
  task: z.enum(['volume', 'tin', 'contours', 'raster_analysis', 'seabed', 'export_dxf', 'export_geojson']),
  payload: z.unknown().optional(),
})

const TINPointSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), z: z.number() })
const TINPayloadSchema = z.object({
  points: z.array(TINPointSchema).min(3).max(50000),
  query_points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
})

const SeabedPayloadSchema = z.object({
  project_id: z.string().uuid().optional(),
  observations: z.array(z.object({
    point_id: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    depth: z.number(),
  })).min(1).max(10000),
  chart_datum_offset_m: z.number(),
})

const volumeCrossSchema = z.object({
  kind: z.literal('cross_section'),
  method: z.enum(['end_area', 'prismoidal', 'cut_fill']),
  sections: z.array(z.object({ chainage: z.number(), area: z.number() })).min(2),
})

const volumeSurfaceSchema = z.object({
  kind: z.literal('surface'),
  method: z.literal('grid_idw').default('grid_idw'),
  gridSpacing: z.number().positive(),
  power: z.number().positive().optional(),
  maxDistance: z.number().positive().optional(),
  existing: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
  design: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
})

export const POST = apiHandler(
  { auth: true, schema: computeRequestSchema, rateLimit: { max: 50, windowMs: 60000 } },
  async (req, ctx) => {
    const { task, payload } = ctx.body as z.infer<typeof computeRequestSchema>

    if (task === 'tin') {
      const parsed = TINPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid TIN payload', issues: parsed.error.issues }, { status: 400 })
      }
      const { generateTIN, interpolateElevation } = await import('@/lib/compute/tin')
      const triangles = generateTIN(parsed.data.points as any[])
      let interpolations: any[] = []
      if (parsed.data.query_points) {
        interpolations = parsed.data.query_points.map(qp => ({
          x: qp.x, y: qp.y,
          elevation: interpolateElevation(triangles, qp.x, qp.y),
        }))
      }
      return NextResponse.json({
        triangle_count: triangles.length,
        point_count: parsed.data.points.length,
        triangles: triangles.slice(0, 1000),
        interpolations,
      })
    }

    if (task === 'seabed') {
      const parsed = SeabedPayloadSchema.safeParse(payload)
      if (parsed.success) {
        const { processSeabedSurvey } = await import('@/lib/compute/seabed')
        try {
          const result = await processSeabedSurvey(
            parsed.data.project_id ?? 'unknown',
            parsed.data.observations as any[],
            parsed.data.chart_datum_offset_m
          )
          return NextResponse.json({ ...result, python_required: false })
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Seabed processing failed' },
            { status: 500 }
          )
        }
      }
    }

    if (task === 'volume') {
      const cross = volumeCrossSchema.safeParse(payload)
      if (cross.success) {
        const { cutFillVolumeFromSignedSections, volumeFromSections } = await import('@/lib/engine/volume')
        const { method, sections } = cross.data
        if (method === 'cut_fill') {
          const r = cutFillVolumeFromSignedSections(sections as any[])
          return NextResponse.json({
            task, kind: 'cross_section', method, cutVolume: r.cutVolume,
            fillVolume: r.fillVolume, netVolume: r.netVolume, segments: r.segments,
          })
        }
        const r = volumeFromSections(sections as any[], method === 'end_area' ? 'end_area' : 'prismoidal')
        return NextResponse.json({
          task, kind: 'cross_section', method: r.method,
          totalVolume: r.totalVolume, segments: r.segments,
        })
      }

      const surface = volumeSurfaceSchema.safeParse(payload)
      if (surface.success) {
        const { surfaceCutFillVolumeGrid } = await import('@/lib/engine/volume')
        const r = surfaceCutFillVolumeGrid({
          existing: surface.data.existing,
          design: surface.data.design,
          gridSpacing: surface.data.gridSpacing,
          power: surface.data.power,
          maxDistance: surface.data.maxDistance,
        } as any)
        return NextResponse.json({
          task, kind: 'surface', method: r.method,
          cutVolume: r.cutVolume, fillVolume: r.fillVolume, netVolume: r.netVolume,
          cellCount: r.cellCount, bbox: r.bbox, warnings: r.warnings,
        })
      }

      return NextResponse.json(
        { error: 'Invalid volume payload. Supported: cross_section or surface.' },
        { status: 400 }
      )
    }

    if (task === 'export_dxf') {
      const schema = z.object({
        projectName: z.string().min(1),
        includeElevations: z.boolean().optional(),
        points: z.array(z.object({
          name: z.string().min(1),
          easting: z.number(),
          northing: z.number(),
          elevation: z.number().optional(),
          is_control: z.boolean().optional(),
        })),
        traverseLegs: z.array(z.object({
          from: z.string().min(1),
          to: z.string().min(1),
          distance: z.number().optional().default(0),
          bearing: z.number().optional().default(0),
        })).optional(),
      })
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid export_dxf payload' }, { status: 400 })
      }
      const { generateDXF } = await import('@/lib/export/generateDXF')
      const dxf = generateDXF(parsed.data as any)
      return NextResponse.json({
        task, kind: 'dxf',
        filename: `${parsed.data.projectName.replace(/\s+/g, '_')}.dxf`,
        dxf, python_required: false,
      })
    }

    if (task === 'export_geojson') {
      const schema = z.object({
        projectName: z.string().min(1),
        utmZone: z.number().int().min(1).max(60).optional(),
        hemisphere: z.enum(['N', 'S']).optional(),
        points: z.array(z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          easting: z.number(),
          northing: z.number(),
          elevation: z.number().nullable().optional(),
          is_control: z.boolean().optional(),
          control_order: z.string().optional(),
        })),
      })
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid export_geojson payload' }, { status: 400 })
      }
      const { generateGeoJSON } = await import('@/lib/export/generateGeoJSON')
      const geojson = generateGeoJSON(parsed.data.points as any[], parsed.data.projectName, parsed.data.utmZone, parsed.data.hemisphere)
      return NextResponse.json({
        task, kind: 'geojson',
        filename: `${parsed.data.projectName.replace(/\s+/g, '_')}.geojson`,
        geojson, python_required: false,
      })
    }

    if (task === 'raster_analysis' || task === 'contours') {
      return NextResponse.json(
        {
          error: `Task '${task}' is not yet implemented. It is on the roadmap and will be available in a future release.`,
          code: 'NOT_IMPLEMENTED',
        },
        { status: 501 }
      )
    }

    return NextResponse.json({ error: 'Unknown compute task', code: 'NOT_FOUND' }, { status: 400 })
  }
)

export const GET = apiHandler({ auth: true }, async () => {
  return NextResponse.json({
    endpoint: '/api/compute',
    description: 'Compute Gateway: routes heavy tasks to Python, keeps deterministic survey math in TS.',
    tasks: ['volume', 'tin', 'contours', 'raster_analysis', 'seabed', 'export_dxf', 'export_geojson'],
    native_tasks: ['volume', 'tin', 'seabed', 'export_dxf', 'export_geojson'],
  })
})