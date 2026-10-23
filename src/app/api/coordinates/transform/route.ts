export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { transformOnlineCoordinates, getSupportedSystems } from '@/lib/online/coordinates'
import { transformRequestSchema, ONLINE_BATCH_MAX_POINTS, UNAVAILABLE_DATUM_GUIDANCE, type OnlineRequest } from '@/lib/online/coordinateContract'

export const POST = apiHandler(
  { auth: true, schema: transformRequestSchema, rateLimit: { max: 120, windowMs: 60000 } },
  async (_req, ctx) => {
    const result = await transformOnlineCoordinates(ctx.body as OnlineRequest)
    return NextResponse.json(result, { status: result.success ? 200 : 422, headers: { 'Cache-Control': 'private, no-store' } })
  }
)
export const GET = apiHandler({ auth: true }, async () => NextResponse.json({
  systems: getSupportedSystems(), maxPoints: ONLINE_BATCH_MAX_POINTS,
  selectors: ['fromCRS', 'toCRS'], horizontalOnly: true, verticalTreatment: 'preserved-untransformed',
  unavailableDatums: UNAVAILABLE_DATUM_GUIDANCE,
  legacy: 'Only WGS84 identity and single-point UTM inverse with an explicit zone/hemisphere remain compatible. Other legacy selectors require explicit CRS codes.',
}, { headers: { 'Cache-Control': 'private, no-store' } }))
