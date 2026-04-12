import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { generateGeoJSON, type SurveyPoint } from '@/lib/export/generateGeoJSON'

const requestSchema = z.object({
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 })
  }

  const input = parsed.data
  const geojson = generateGeoJSON(input.points as SurveyPoint[], input.projectName, input.utmZone, input.hemisphere)
  return NextResponse.json({
    kind: 'geojson',
    filename: `${input.projectName.replace(/\s+/g, '_')}.geojson`,
    geojson,
    python_required: false,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/compute/export/geojson',
    description: 'GeoJSON export (TypeScript-only).',
    python_required: false,
  })
}
