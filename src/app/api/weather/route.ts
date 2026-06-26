import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lon = searchParams.get('lon')

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  try {
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set('current', 'temperature_2m,surface_pressure,relative_humidity_2m')
    url.searchParams.set('timezone', 'auto')

    const response = await fetch(url.toString())
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Weather service unavailable' }, { status: 503 })
    }

    const data = await response.json()
    
    return NextResponse.json({
      temperature: data.current.temperature_2m,
      pressure: data.current.surface_pressure,
      humidity: data.current.relative_humidity_2m,
      fetchedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Weather fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 })
  }
}
