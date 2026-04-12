import { NextRequest, NextResponse } from 'next/server'

interface SentinelItem {
  id: string
  date: string
  cloudCover: number
  thumbnailUrl: string
  tileUrl: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const bbox = searchParams.get('bbox')
  const date = searchParams.get('date')

  if (!bbox) {
    return NextResponse.json({ error: 'bbox required' }, { status: 400 })
  }

  try {
    // Parse bbox: minLon,minLat,maxLon,maxLat
    const bboxParts = bbox.split(',').map(Number)
    const [minLon, minLat, maxLon, maxLat] = bboxParts
    
    if (bboxParts.some(isNaN)) {
      return NextResponse.json({ error: 'Invalid bbox format' }, { status: 400 })
    }

    // Calculate center for tile URL
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2

    // Try Copernicus STAC API first
    try {
      const stacUrl = 'https://catalogue.dataspace.copernicus.eu/stac/v1/search'
      const queryParams = new URLSearchParams({
        collections: 'SENTINEL-2',
        bbox: bbox,
        datetime: date ? date + '-01/' + date + '-28' : '2024-01-01/2024-12-31',
        limit: '5'
      })

      const response = await fetch(stacUrl + '?' + queryParams, {
        headers: { 'Accept': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        
        const items: SentinelItem[] = (data.features || []).slice(0, 5).map((feature: any) => ({
          id: feature.id,
          date: feature.properties.datetime,
          cloudCover: feature.properties['eo:cloud_cover'],
          thumbnailUrl: feature.assets?.thumbnail?.href || '',
          tileUrl: 'https://sentinel-cogs.s3.amazonaws.com/' + feature.id.substring(0, 8) + '/' + feature.id + '/' + feature.id + '-preview.jpg'
        }))

        return NextResponse.json({ items })
      }
    } catch (stacError) {
      console.log('STAC API unavailable, using fallback')
    }

    // Fallback: return OpenStreetMap tiles with message
    return NextResponse.json({
      items: [],
      fallback: true,
      message: 'Sentinel-2 unavailable, using OpenStreetMap',
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors'
    })
  } catch (error) {
    console.error('Sentinel imagery error:', error)
    return NextResponse.json({ error: 'Failed to fetch imagery' }, { status: 500 })
  }
}
