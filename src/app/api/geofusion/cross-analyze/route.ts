/**
 * /api/geofusion/cross-analyze
 *
 * POST — Run cross-layer analysis (overlay / buffer / distance) on a
 * set of GeoFusion layers.
 *
 * AUDIT FIX (2026-07-03): The CrossAnalyzer component called this
 * endpoint but no route existed — so analysis always 404'd (and the
 * old UI hid the 404 by returning fake results when projectId was
 * 'default').
 *
 * This route is intentionally pragmatic: GeoFusion doesn't have a
 * Python worker for cross-analysis yet, so we compute a *metadata-
 * level* result on the server (which layers were selected, what
 * analysis was requested, count of layers and types) and return it
 * with a clear `status: 'metadata_only'` flag. The UI can then
 * honestly tell the user "this is a metadata-only summary; full
 * geometric analysis requires the GeoFusion Pro extension".
 *
 * When a real geometric backend is wired up (PostGIS or a Python
 * worker), replace the body of this route with the real call.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { z } from 'zod'

const CrossAnalyzeSchema = z.object({
  project_id: z.string().min(1),
  layer_ids: z.array(z.string().min(1)).min(2, 'At least 2 layers required').max(20),
  analysis_type: z.enum(['overlay', 'buffer', 'distance']),
  buffer_distance_m: z.number().positive().max(10000).optional(),
})

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = CrossAnalyzeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 },
      )
    }

    const { project_id, layer_ids, analysis_type, buffer_distance_m } = parsed.data

    // ─── Metadata-level analysis ───────────────────────────────────────────
    //
    // We don't have access to actual layer geometries from this route
    // (layers are stored client-side in the GeoFusion Hub demo). What
    // we CAN do is compute a structural summary that's still useful:
    //   - which layers were selected
    //   - what analysis was requested
    //   - pairwise count (for overlay/distance) or buffer geometry
    //     count (for buffer)
    //
    // When a real PostGIS-backed layers table exists, this is where
    // we'd query `SELECT ST_Intersection(...)` etc. instead.

    const pairs: Array<[string, string]> = []
    for (let i = 0; i < layer_ids.length; i++) {
      for (let j = i + 1; j < layer_ids.length; j++) {
        pairs.push([layer_ids[i], layer_ids[j]])
      }
    }

    const result = {
      status: 'metadata_only',
      analysis_type,
      project_id,
      selected_layers: layer_ids,
      layer_count: layer_ids.length,
      pair_count: pairs.length,
      pairs,
      buffer_distance_m: analysis_type === 'buffer' ? (buffer_distance_m ?? 50) : undefined,
      message:
        analysis_type === 'overlay'
          ? `Would compute geometric intersection of ${pairs.length} layer pair(s).`
          : analysis_type === 'buffer'
            ? `Would create a ${buffer_distance_m ?? 50}m buffer around each of the ${layer_ids.length} selected layer(s).`
            : `Would compute pairwise distances between ${pairs.length} layer pair(s).`,
      // Hint to the UI / future engineer: this is the place to wire
      // a real geometric backend.
      backend: 'metadata-only (no PostGIS query yet)',
      computed_at: new Date().toISOString(),
    }

    return NextResponse.json({
      results: result,
      summary: {
        analysis_type,
        layer_count: layer_ids.length,
        pair_count: pairs.length,
        status: 'metadata_only',
      },
    })
  } catch (err) {
    console.error('GeoFusion cross-analyze error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
