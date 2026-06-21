import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface BenchmarkRow {
  id: string
  name?: string
  description?: string
  latitude?: number
  northing?: number
  longitude?: number
  easting?: number
  elevation?: number
  status?: string
  [key: string]: unknown
}

interface BenchmarkWithDistance extends BenchmarkRow {
  distanceKm: number
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')
  const radius = parseFloat(searchParams.get('radius') || '10')
  const limit = parseInt(searchParams.get('limit') || '10')

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const latitude = parseFloat(lat)
  const longitude = parseFloat(lon)

  if (isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  try {
    let rows: BenchmarkRow[]

    try {
      const res = await db.query(`SELECT * FROM benchmarks WHERE status = 'ACTIVE' LIMIT 100`)
      rows = res.rows as BenchmarkRow[]
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err as Error).message : ''
      if (msg.includes('column "status" does not exist')) {
        const res = await db.query('SELECT * FROM benchmarks LIMIT 100')
        rows = res.rows as BenchmarkRow[]
      } else {
        throw err
      }
    }

    const results: BenchmarkWithDistance[] = rows
      .map((bm) => ({
        ...bm,
        distanceKm: calculateDistance(
          latitude,
          longitude,
          bm.latitude ?? bm.northing ?? 0,
          bm.longitude ?? bm.easting ?? 0
        ),
      }))
      .filter((bm) => bm.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)

    return NextResponse.json(results)
  } catch (error) {
    console.error('Benchmark lookup error:', error)
    return NextResponse.json({ error: 'Failed to lookup benchmarks' }, { status: 500 })
  }
}
