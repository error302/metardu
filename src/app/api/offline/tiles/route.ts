import { NextRequest, NextResponse } from 'next/server'

// ─── Tile count calculation (server-side) ─────────────────────────────────
// This is the server-side counterpart that validates input and calculates
// tile counts for the requested bounding box and zoom range.
// Actual tile fetching is done client-side.

interface TileSourceRequest {
  id: string
  url: string
  label: string
}

interface TileCountRequest {
  sources: TileSourceRequest[]
  bounds: {
    minLat: number
    minLon: number
    maxLat: number
    maxLon: number
  }
  minZoom: number
  maxZoom: number
}

interface ZoomBreakdown {
  zoom: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  tileCount: number
}

interface SourceTileInfo {
  id: string
  label: string
  url: string
  tileCount: number
  estimatedSizeBytes: number
  zoomBreakdown: ZoomBreakdown[]
}

function calculateTilesForBounds(
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  minZoom: number,
  maxZoom: number,
): { total: number; breakdown: ZoomBreakdown[] } {
  const { minLat, minLon, maxLat, maxLon } = bounds
  let total = 0
  const breakdown: ZoomBreakdown[] = []

  for (let z = minZoom; z <= maxZoom; z++) {
    const n = Math.pow(2, z)

    // Clamp latitudes to valid Mercator range
    const clampedMinLat = Math.max(Math.min(minLat, 85.0511), -85.0511)
    const clampedMaxLat = Math.max(Math.min(maxLat, 85.0511), -85.0511)

    const xMin = Math.floor(((minLon + 180) / 360) * n)
    const xMax = Math.floor(((maxLon + 180) / 360) * n)

    const latRad1 = (clampedMaxLat * Math.PI) / 180
    const latRad2 = (clampedMinLat * Math.PI) / 180
    const yMin = Math.floor(((1 - Math.log(Math.tan(latRad1) + 1 / Math.cos(latRad1)) / Math.PI) / 2) * n)
    const yMax = Math.floor(((1 - Math.log(Math.tan(latRad2) + 1 / Math.cos(latRad2)) / Math.PI) / 2) * n)

    const xTiles = xMax - xMin + 1
    const yTiles = yMax - yMin + 1
    const tileCount = Math.max(0, xTiles * yTiles)

    breakdown.push({ zoom: z, xMin, xMax, yMin, yMax, tileCount })
    total += tileCount
  }

  return { total, breakdown }
}

function estimateTileSize(sourceId: string): number {
  // Average compressed tile sizes
  if (sourceId.includes('satellite') || sourceId.includes('esri')) return 30 * 1024
  if (sourceId.includes('osm') || sourceId.includes('openstreetmap')) return 15 * 1024
  return 20 * 1024 // default/custom
}

export async function POST(request: NextRequest) {
  try {
    const body: TileCountRequest = await request.json()

    // ─── Input validation ───────────────────────────────────────────────
    if (!body.sources || !Array.isArray(body.sources) || body.sources.length === 0) {
      return NextResponse.json(
        { error: 'At least one tile source is required' },
        { status: 400 },
      )
    }

    if (!body.bounds || typeof body.bounds.minLat !== 'number' || typeof body.bounds.maxLat !== 'number' ||
        typeof body.bounds.minLon !== 'number' || typeof body.bounds.maxLon !== 'number') {
      return NextResponse.json(
        { error: 'Valid bounds (minLat, maxLat, minLon, maxLon) are required' },
        { status: 400 },
      )
    }

    const { minLat, maxLat, minLon, maxLon } = body.bounds
    if (minLat >= maxLat || minLon >= maxLon) {
      return NextResponse.json(
        { error: 'Invalid bounds: minLat must be less than maxLat and minLon less than maxLon' },
        { status: 400 },
      )
    }

    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      return NextResponse.json(
        { error: 'Bounds must be within valid WGS84 coordinate ranges' },
        { status: 400 },
      )
    }

    if (typeof body.minZoom !== 'number' || typeof body.maxZoom !== 'number') {
      return NextResponse.json(
        { error: 'minZoom and maxZoom are required numbers' },
        { status: 400 },
      )
    }

    const minZoom = Math.max(0, Math.min(22, Math.floor(body.minZoom)))
    const maxZoom = Math.max(0, Math.min(22, Math.floor(body.maxZoom)))

    if (minZoom > maxZoom) {
      return NextResponse.json(
        { error: 'minZoom must be less than or equal to maxZoom' },
        { status: 400 },
      )
    }

    // ─── Calculate tile counts ──────────────────────────────────────────
    const { total, breakdown } = calculateTilesForBounds(body.bounds, minZoom, maxZoom)

    // Safety cap: warn if too many tiles
    const MAX_TILES = 500000
    const capped = total > MAX_TILES

    // Per-source info
    const sources: SourceTileInfo[] = body.sources.map((src) => {
      const avgTileSize = estimateTileSize(src.id)
      return {
        id: src.id,
        label: src.label,
        url: src.url,
        tileCount: total,
        estimatedSizeBytes: total * avgTileSize,
        zoomBreakdown: breakdown,
      }
    })

    // Total estimated size across all sources
    const totalEstimatedBytes = sources.reduce((sum, s) => sum + s.estimatedSizeBytes, 0)

    return NextResponse.json({
      totalTiles: total,
      sources,
      zoomBreakdown: breakdown,
      estimatedSizeBytes: totalEstimatedBytes,
      capped,
      maxTiles: MAX_TILES,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500 },
    )
  }
}
