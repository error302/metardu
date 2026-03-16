import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { cutFillVolumeFromSignedSections, surfaceCutFillVolumeGrid, volumeFromSections } from '@/lib/engine/volume'

const crossSectionSchema = z.object({
  kind: z.literal('cross_section'),
  method: z.enum(['end_area', 'prismoidal', 'cut_fill']),
  sections: z
    .array(
      z.object({
        chainage: z.number(),
        area: z.number(),
      })
    )
    .min(2),
})

const surfaceSchema = z.object({
  kind: z.literal('surface'),
  method: z.literal('grid_idw').default('grid_idw'),
  gridSpacing: z.number().positive(),
  power: z.number().positive().optional(),
  maxDistance: z.number().positive().optional(),
  existing: z
    .array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() }))
    .min(3),
  design: z
    .array(z.object({ easting: z.number(), northing: z.number(), elevation: z.number() }))
    .min(3),
})

const requestSchema = z.union([crossSectionSchema, surfaceSchema])

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 })
  }

  const input = parsed.data

  if (input.kind === 'cross_section') {
    const sections = input.sections
    if (input.method === 'cut_fill') {
      const r = cutFillVolumeFromSignedSections(sections)
      return NextResponse.json({
        kind: 'cross_section',
        method: 'cut_fill',
        cutVolume: r.cutVolume,
        fillVolume: r.fillVolume,
        netVolume: r.netVolume,
        segments: r.segments,
      })
    }

    const r = volumeFromSections(sections, input.method === 'end_area' ? 'end_area' : 'prismoidal')
    return NextResponse.json({
      kind: 'cross_section',
      method: r.method,
      totalVolume: r.totalVolume,
      segments: r.segments,
    })
  }

  const r = surfaceCutFillVolumeGrid({
    existing: input.existing,
    design: input.design,
    gridSpacing: input.gridSpacing,
    power: input.power,
    maxDistance: input.maxDistance,
  })
  return NextResponse.json({
    kind: 'surface',
    method: r.method,
    cutVolume: r.cutVolume,
    fillVolume: r.fillVolume,
    netVolume: r.netVolume,
    cellCount: r.cellCount,
    bbox: r.bbox,
    warnings: r.warnings,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/compute/volume',
    description: 'Volume computation (TypeScript-only): cross-sections and surface cut/fill by grid method.',
    python_optional: false,
  })
}
