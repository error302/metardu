export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { transformOnlineCoordinates, resolveOnlineReferences, getSupportedSystems } from '@/lib/online/coordinates'
import { transformBatchSchema, onlineFailure, ONLINE_BATCH_MAX_POINTS, UNAVAILABLE_DATUM_GUIDANCE, type OnlineRequest, type NamedCoordinates, type TransformResult } from '@/lib/online/coordinateContract'

type RowResult = { index: number; source: unknown; id?: unknown; name?: unknown } & ({ success: true; result: NamedCoordinates } | Extract<TransformResult, { success: false }>)
export const POST = apiHandler(
  { auth: true, schema: transformBatchSchema, rateLimit: { max: 10, windowMs: 60000 } },
  async (_req, ctx) => {
    const body = ctx.body as OnlineRequest & { points: unknown[] }
    let references
    try { references = resolveOnlineReferences(body, true) }
    catch (error) { return NextResponse.json(onlineFailure(error), { status: 422, headers: { 'Cache-Control': 'private, no-store' } }) }
    const results: RowResult[] = []
    for (const [index, source] of body.points.entries()) {
      const point = source !== null && typeof source === 'object' && !Array.isArray(source) ? source as OnlineRequest : null
      let outcome: TransformResult | { success: false; code: 'INVALID_COORDINATE' | 'CRS_AMBIGUOUS'; error: string }
      if (!point) outcome = { success: false, code: 'INVALID_COORDINATE', error: 'A coordinate row must be an object with the named source measurements.' }
      else if (['fromCRS', 'toCRS', 'fromSystem', 'toSystem'].some(key => Object.hasOwn(point, key))) outcome = { success: false, code: 'CRS_AMBIGUOUS', error: 'Rows cannot override the common batch references.' }
      else outcome = await transformOnlineCoordinates({ zone: body.zone, hemisphere: body.hemisphere, ...point, fromCRS: references.fromCRS, toCRS: references.toCRS })
      results.push({ index, source, ...(point && Object.hasOwn(point, 'id') ? { id: point.id } : {}), ...(point && Object.hasOwn(point, 'name') ? { name: point.name } : {}),
        ...(outcome.success ? { success: true as const, result: outcome.result } : outcome) })
    }
    const successCount = results.filter(row => row.success).length
    return NextResponse.json({ ...references, totalPoints: results.length, successCount, errorCount: results.length - successCount, results }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)
export const GET = apiHandler({ auth: true }, async () => NextResponse.json({
  endpoint: '/coordinates/batch', description: 'Explicit horizontal CRS transformation with indexed per-row outcomes.',
  systems: getSupportedSystems(), maxPoints: ONLINE_BATCH_MAX_POINTS, unavailableDatums: UNAVAILABLE_DATUM_GUIDANCE,
  selectors: ['fromCRS', 'toCRS'], horizontalOnly: true, verticalTreatment: 'preserved-untransformed',
}, { headers: { 'Cache-Control': 'private, no-store' } }))
