/**
 * API: POST /api/osm/context-geojson
 *
 * Proxy to the Python worker's context-geojson endpoint.
 *
 * SECURITY (audit H-12, 2026-08-30): requires an authenticated session, is
 * rate-limited, and the radius is capped (2000m).
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || 'http://localhost:8001'
const WORKER_SECRET = process.env.WORKER_SECRET || ''

const MAX_RADIUS_METERS = 2000
const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

const handlePost = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60000 } },
  async (request: NextRequest) => {
    try {
      const body: unknown = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
          { error: 'Request body must include numeric lat, lon, and radius values.' },
          { status: 400, headers: PRIVATE_NO_STORE },
        )
      }

      const { lat, lon, radius: requestedRadius } = body as Record<string, unknown>
      if (
        typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180 ||
        typeof requestedRadius !== 'number' || !Number.isFinite(requestedRadius) || requestedRadius <= 0
      ) {
        return NextResponse.json(
          { error: 'lat and lon must be valid WGS 84 coordinates and radius must be a positive number.' },
          { status: 400, headers: PRIVATE_NO_STORE },
        )
      }

      const radius = Math.ceil(Math.min(Math.max(requestedRadius, 50), MAX_RADIUS_METERS))
      const res = await fetch(`${PYTHON_WORKER_URL}/osm/context-geojson`, {
        method: 'POST',
        signal: request.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': WORKER_SECRET,
        },
        body: JSON.stringify({ lat, lon, radius }),
      })

      if (!res.ok) {
        return NextResponse.json(
          { error: `Worker returned ${res.status}` },
          { status: res.status, headers: PRIVATE_NO_STORE },
        )
      }

      const data = (await res.json()) as unknown
      return NextResponse.json(data, { headers: PRIVATE_NO_STORE })
    } catch (err) {
      return NextResponse.json(
        {
          error: 'Python worker unavailable or failed to process',
          message: err instanceof Error ? err.message : 'Unknown',
        },
        { status: 503, headers: PRIVATE_NO_STORE },
      )
    }
  }
)

/** Ensure early auth/rate-limit responses are private too. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await handlePost(request)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
