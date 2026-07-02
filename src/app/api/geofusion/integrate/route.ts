/**
 * /api/geofusion/integrate
 *
 * POST — Integrate (merge) multiple GeoFusion layers into a single
 * combined layer using the requested merge strategy.
 *
 * AUDIT FIX (2026-07-03): The DataIntegrator component called this
 * endpoint but no route existed. (The old UI hid the 404 by returning
 * fake results when projectId was 'default'.)
 *
 * Like /api/geofusion/cross-analyze, this is currently a metadata-
 * level result — we don't have a PostGIS-backed layers table yet to
 * run real ST_Union / ST_Intersection against. The route returns an
 * honest structural summary with `status: 'metadata_only'` so the
 * UI can show "Integration queued — backend not yet wired".
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { z } from 'zod'

const IntegrateSchema = z.object({
  project_id: z.string().min(1),
  layer_ids: z.array(z.string().min(1)).min(2, 'At least 2 layers required').max(50),
  merge_strategy: z.enum(['overlay', 'union', 'intersection']),
})

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = IntegrateSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 },
      )
    }

    const { project_id, layer_ids, merge_strategy } = parsed.data

    // ─── Metadata-level integration ────────────────────────────────────────
    // A real implementation would query the layers table for each
    // layer_id, get their geometries, and run ST_Union / ST_Intersection
    // / ST_Overlay. Without that backend, we return a structural result
    // that tells the UI what *would* happen.
    const result = {
      status: 'metadata_only',
      merge_strategy,
      project_id,
      source_layers: layer_ids,
      layer_count: layer_ids.length,
      // Placeholder for the real integrated GeoJSON FeatureCollection
      integrated_data: {
        type: 'FeatureCollection' as const,
        features: [] as unknown[],
        merge_strategy,
        source_layer_ids: layer_ids,
      },
      features_created: 0,
      message: `Would compute ${merge_strategy} of ${layer_ids.length} layer(s) — backend not yet wired.`,
      backend: 'metadata-only (no PostGIS query yet)',
      computed_at: new Date().toISOString(),
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('GeoFusion integrate error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
