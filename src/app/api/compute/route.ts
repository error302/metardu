export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler, ValidationError, NotFoundError } from '@/lib/api/handler'
import { z } from 'zod'
import { ComputeRequestSchema } from '@/lib/validation/apiSchemas'
import { computeRasterAnalysis, validateRasterRequest } from '@/lib/compute/rasterAnalysis'

const TINPointSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), z: z.number() })
const TINPayloadSchema = z.object({
  points: z.array(TINPointSchema).min(3).max(50000),
  query_points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
})

const volumeCrossSchema = z.object({
  kind: z.literal('cross_section'),
  method: z.enum(['end_area', 'prismoidal', 'cut_fill']),
  sections: z.array(z.object({ chainage: z.number(), area: z.number() })).min(2),
})

const volumeSurfaceSchema = z.object({
  kind: z.literal('surface'),
  method: z.literal('grid_idw').prefault('grid_idw'),
  gridSpacing: z.number().positive(),
  power: z.number().positive().optional(),
  maxDistance: z.number().positive().optional(),
  existing: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
  design: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
})

export const POST = apiHandler({
  requireAuth: true,
  schema: ComputeRequestSchema,
  rateLimit: { max: 50, windowMs: 60000 },
  handler: async (ctx) => {
    const { task, payload } = ctx.input

    if (task === 'tin') {
      const parsed = TINPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        throw new ValidationError('Invalid TIN payload', parsed.error.issues)
      }
      const { generateTIN, interpolateElevation } = await import('@/lib/compute/tin')
      const triangles = generateTIN(parsed.data.points)
      let interpolations: Array<{ x: number; y: number; elevation: number | null }> = []
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

    if (task === 'volume') {
      const cross = volumeCrossSchema.safeParse(payload)
      if (cross.success) {
        const { cutFillVolumeFromSignedSections, volumeFromSections } = await import('@/lib/engine/volume')
        const { method, sections } = cross.data
        if (method === 'cut_fill') {
          const r = cutFillVolumeFromSignedSections(sections)
          return NextResponse.json({
            task, kind: 'cross_section', method, cutVolume: r.cutVolume,
            fillVolume: r.fillVolume, netVolume: r.netVolume, segments: r.segments,
          })
        }
        const r = volumeFromSections(sections, method === 'end_area' ? 'end_area' : 'prismoidal')
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
        })
        return NextResponse.json({
          task, kind: 'surface', method: r.method,
          cutVolume: r.cutVolume, fillVolume: r.fillVolume, netVolume: r.netVolume,
          cellCount: r.cellCount, bbox: r.bbox, warnings: r.warnings,
        })
      }

      throw new ValidationError('Invalid volume payload. Supported: cross_section or surface.')
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
          distance: z.number().prefault(0),
          bearing: z.number().prefault(0),
        })).optional(),
      })
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        throw new ValidationError('Invalid export_dxf payload', parsed.error.issues)
      }
      const { generateDXF } = await import('@/lib/export/generateDXF')
      const dxf = generateDXF(parsed.data)
      return NextResponse.json({
        task, kind: 'dxf',
        filename: `${parsed.data.projectName.replace(/\s+/g, '_')}.dxf`,
        dxf, python_required: false,
      })
    }

    if (task === 'export_geojson') {
      const schema = z.object({
        projectName: z.string().min(1),
        utmZone: z.number().int().min(1).max(60),
        hemisphere: z.enum(['N', 'S']),
        datum: z.string().min(1),
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
        throw new ValidationError('Invalid export_geojson payload', parsed.error.issues)
      }
      const { generateGeoJSON } = await import('@/lib/export/generateGeoJSON')
      const geojson = generateGeoJSON(parsed.data.points, parsed.data.projectName, parsed.data.utmZone, parsed.data.hemisphere, parsed.data.datum)
      return NextResponse.json({
        task, kind: 'geojson',
        filename: `${parsed.data.projectName.replace(/\s+/g, '_')}.geojson`,
        geojson, python_required: false,
      })
    }

    if (task === 'raster_analysis' || task === 'contours') {
      const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null
      const projectId = payloadRecord?.project_id
      if (typeof projectId !== 'string' || !projectId.trim()) {
        throw new ValidationError('project_id is required for raster analysis.')
      }

      const rasterPayload = {
        analysis_type: task === 'contours' ? 'contour' : payloadRecord?.analysis_type,
        params: payloadRecord?.params,
      }
      const validatedRaster = validateRasterRequest(rasterPayload)
      if (!validatedRaster) {
        throw new ValidationError(task === 'contours'
          ? 'Invalid contours payload. Supply params.elevation_grid and a positive params.contour_interval.'
          : 'Invalid raster_analysis payload. Supply a supported analysis_type and params object.')
      }

      const result = await computeRasterAnalysis({
        project_id: projectId,
        ...validatedRaster,
      })
      return NextResponse.json({ task, ...result, python_required: false })
    }

    throw new NotFoundError('Unknown compute task')
  },
})

export const GET = apiHandler({
  requireAuth: true,
  handler: async () => {
    return NextResponse.json({
      endpoint: '/api/compute',
      description: 'Compute Gateway: routes heavy tasks to Python, keeps deterministic survey math in TS.',
      tasks: ['volume', 'tin', 'contours', 'raster_analysis', 'export_dxf', 'export_geojson'],
      native_tasks: ['volume', 'tin', 'contours', 'raster_analysis', 'export_dxf', 'export_geojson'],
    })
  },
})
