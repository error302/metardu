import { NextRequest, NextResponse } from 'next/server'
import { searchBenchmarks, getBenchmarkById, getAvailableCountries, getBenchmarkTypes } from '@/lib/online/benchmarks'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { country, region, type, radiusKm, latitude, longitude } = body

    const result = await searchBenchmarks({
      country,
      region,
      type,
      radiusKm,
      latitude,
      longitude
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const countries = searchParams.get('countries')
  const types = searchParams.get('types')

  if (id) {
    const benchmark = await getBenchmarkById(id)
    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(benchmark)
  }

  if (countries === 'true') {
    return NextResponse.json({ countries: getAvailableCountries() })
  }

  if (types === 'true') {
    return NextResponse.json({ types: getBenchmarkTypes() })
  }

  return NextResponse.json({
    description: 'Benchmark database search API',
    endpoints: {
      POST: 'Search benchmarks by country, region, type, or location',
      'GET ?id=': 'Get benchmark by ID',
      'GET ?countries=true': 'List available countries',
      'GET ?types=true': 'List benchmark types'
    }
  })
}
