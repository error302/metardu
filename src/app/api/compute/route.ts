import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { callPythonCompute } from '@/lib/compute/pythonService'
import { generateTIN, interpolateElevation, type TINPoint } from '@/lib/compute/tin'
import { processSeabedSurvey, SeabedObservationSchema, type SeabedObservation } from '@/lib/compute/seabed'
import { generateDXF, type DXFExportOptions } from '@/lib/export/generateDXF'
import { generateGeoJSON, type SurveyPoint as GeoJSONSurveyPoint } from '@/lib/export/generateGeoJSON'
import { cutFillVolumeFromSignedSections, surfaceCutFillVolumeGrid, volumeFromSections, type VolumeSection, type SurfaceVolumeGridInput } from '@/lib/engine/volume'
import { apiSuccess, apiError } from '@/lib/api/response'

const taskSchema = z.object({
  task: z.enum(['volume', 'tin', 'contours', 'raster_analysis', 'seabed', 'export_dxf', 'export_geojson']),
  payload: z.unknown(),
})

// ─── Native TIN handler ──────────────────────────────────────────────────────
const TINPointSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), z: z.number() })
const TINPayloadSchema = z.object({
  points: z.array(TINPointSchema).min(3).max(50000),
  query_points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
})

function handleTIN(payload: unknown) {
  const parsed = TINPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(apiError('Invalid TIN payload.', { issues: parsed.error.issues }), { status: 400 })
  }
  try {
    const triangles = generateTIN(parsed.data.points as TINPoint[])
    let interpolations: Array<{ x: number; y: number; elevation: number | null }> = []
    if (parsed.data.query_points) {
      interpolations = parsed.data.query_points.map((qp): { x: number; y: number; elevation: number | null } => ({
        x: qp.x,
        y: qp.y,
        elevation: interpolateElevation(triangles, qp.x, qp.y),
      }))
    }
    return NextResponse.json(apiSuccess({
      task: 'tin',
      triangle_count: triangles.length,
      point_count: parsed.data.points.length,
      triangles: triangles.slice(0, 1000),
      interpolations,
      python_required: false,
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TIN generation failed'
    return NextResponse.json(apiError(message), { status: 500 })
  }
}

// ─── Native Seabed handler ───────────────────────────────────────────────────
const SeabedPayloadSchema = z.object({
  project_id: z.string().uuid().optional(),
  observations: z.array(SeabedObservationSchema).min(1).max(10000),
  chart_datum_offset_m: z.number(),
})

async function handleSeabed(payload: unknown) {
  const parsed = SeabedPayloadSchema.safeParse(payload)
  if (parsed.success) {
    try {
      const result = await processSeabedSurvey(
        parsed.data.project_id ?? 'unknown',
        parsed.data.observations as SeabedObservation[],
        parsed.data.chart_datum_offset_m,
      )
      return NextResponse.json(apiSuccess({ ...result, python_required: false }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Seabed processing failed'
      return NextResponse.json(apiError(message), { status: 500 })
    }
  }
  // Fall through to Python if native TS parsing fails
  return null
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = taskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(apiError('Invalid request.', { issues: parsed.error.issues }), { status: 400 })
  }

  const { task, payload } = parsed.data

  // ─── TIN: native TypeScript ─────────────────────────────────────────────
  if (task === 'tin') {
    return handleTIN(payload)
  }

  // ─── Seabed: native TypeScript with Python fallback ─────────────────────
  if (task === 'seabed') {
    const nativeResult = await handleSeabed(payload)
    if (nativeResult) return nativeResult
    // Fall through to Python below
  }

  // ─── Volume: native TypeScript ──────────────────────────────────────────
  if (task === 'volume') {
    const cross = z
      .object({
        kind: z.literal('cross_section'),
        method: z.enum(['end_area', 'prismoidal', 'cut_fill']),
        sections: z.array(z.object({ chainage: z.number(), area: z.number() })).min(2),
      })
      .safeParse(payload)

    if (cross.success) {
      const { method, sections } = cross.data
      if (method === 'cut_fill') {
        const r = cutFillVolumeFromSignedSections(sections as VolumeSection[])
        return NextResponse.json(apiSuccess({ task, kind: 'cross_section', method, cutVolume: r.cutVolume, fillVolume: r.fillVolume, netVolume: r.netVolume, segments: r.segments }))
      }
      const r = volumeFromSections(sections as VolumeSection[], method === 'end_area' ? 'end_area' : 'prismoidal')
      return NextResponse.json(apiSuccess({ task, kind: 'cross_section', method: r.method, totalVolume: r.totalVolume, segments: r.segments }))
    }

    const surface = z
      .object({
        kind: z.literal('surface'),
        method: z.literal('grid_idw').default('grid_idw'),
        gridSpacing: z.number().positive(),
        power: z.number().positive().optional(),
        maxDistance: z.number().positive().optional(),
        existing: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
        design: z.array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() })).min(3),
      })
      .safeParse(payload)

    if (!surface.success) {
      return NextResponse.json(
        apiError('Invalid volume payload. Supported: cross_section (end_area/prismoidal/cut_fill) or surface (grid_idw).', { python_required: false }),
        { status: 400 }
      )
    }

    const r = surfaceCutFillVolumeGrid({
      existing: surface.data.existing,
      design: surface.data.design,
      gridSpacing: surface.data.gridSpacing,
      power: surface.data.power,
      maxDistance: surface.data.maxDistance,
    } as SurfaceVolumeGridInput)
    return NextResponse.json(apiSuccess({
      task,
      kind: 'surface',
      method: r.method,
      cutVolume: r.cutVolume,
      fillVolume: r.fillVolume,
      netVolume: r.netVolume,
      cellCount: r.cellCount,
      bbox: r.bbox,
      warnings: r.warnings,
    }))
  }

  // ─── DXF Export: native TypeScript ──────────────────────────────────────
  if (task === 'export_dxf') {
    const schema = z.object({
      projectName: z.string().min(1),
      includeElevations: z.boolean().optional(),
      points: z.array(
        z.object({
          name: z.string().min(1),
          easting: z.number(),
          northing: z.number(),
          elevation: z.number().optional(),
          is_control: z.boolean().optional(),
        })
      ),
      traverseLegs: z
        .array(
          z.object({
            from: z.string().min(1),
            to: z.string().min(1),
            distance: z.number().optional().default(0),
            bearing: z.number().optional().default(0),
          })
        )
        .optional(),
    })

    const parsedExport = schema.safeParse(payload)
    if (!parsedExport.success) {
      return NextResponse.json(apiError('Invalid export_dxf payload.', { issues: parsedExport.error.issues }), { status: 400 })
    }

    const input = parsedExport.data
    const dxf = generateDXF({
      projectName: input.projectName,
      points: input.points,
      traverseLegs: input.traverseLegs ?? [],
      includeElevations: input.includeElevations,
    } as DXFExportOptions)

    return NextResponse.json(apiSuccess({
      task,
      kind: 'dxf',
      filename: `${input.projectName.replace(/\s+/g, '_')}.dxf`,
      dxf,
      python_required: false,
    }))
  }

  // ─── GeoJSON Export: native TypeScript ──────────────────────────────────
  if (task === 'export_geojson') {
    const schema = z.object({
      projectName: z.string().min(1),
      utmZone: z.number().int().min(1).max(60).optional(),
      hemisphere: z.enum(['N', 'S']).optional(),
      points: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          easting: z.number(),
          northing: z.number(),
          elevation: z.number().nullable().optional(),
          is_control: z.boolean().optional(),
          control_order: z.string().optional(),
        })
      ),
    })

    const parsedExport = schema.safeParse(payload)
    if (!parsedExport.success) {
      return NextResponse.json(
        apiError('Invalid export_geojson payload.', { issues: parsedExport.error.issues }),
        { status: 400 }
      )
    }

    const input = parsedExport.data
    const geojson = generateGeoJSON(input.points as GeoJSONSurveyPoint[], input.projectName, input.utmZone, input.hemisphere)
    return NextResponse.json(apiSuccess({
      task,
      kind: 'geojson',
      filename: `${input.projectName.replace(/\s+/g, '_')}.geojson`,
      geojson,
      python_required: false,
    }))
  }

  // ─── Python fallback for contours and raster_analysis ───────────────────
  const pythonMapping: Record<string, string> = {
    contours: '/terrain/contours',
    raster_analysis: '/raster/analyze',
    seabed: '/hydro/seabed',
  }

  const pythonPath = pythonMapping[task]
  if (pythonPath) {
    const python = await callPythonCompute<any>(pythonPath, payload, { timeoutMs: 30000 })
    if (!python.ok) {
      const err = python as { ok: false; status: number; error: string; fallback?: boolean; details?: unknown }
      return NextResponse.json(apiError(err.error, { fallback: err.fallback ?? true, details: err.details, python_required: true }), { status: err.status })
    }
    return NextResponse.json(python.value)
  }

  return NextResponse.json(apiError('Unknown compute task.'), { status: 400 })
}

export async function GET() {
  return NextResponse.json(apiSuccess({
    endpoint: '/api/compute',
    description: 'Compute Gateway: routes heavy tasks to Python, keeps deterministic survey math in TS.',
    tasks: ['volume', 'tin', 'contours', 'raster_analysis', 'seabed', 'export_dxf', 'export_geojson'],
    native_tasks: ['volume', 'tin', 'seabed', 'export_dxf', 'export_geojson'],
    python_tasks: ['contours', 'raster_analysis'],
  }))
}
