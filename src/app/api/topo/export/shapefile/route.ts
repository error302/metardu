import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { contours, spotHeights } = await req.json()

    const contourLines = contours.flatMap((c: any) =>
      c.coordinates.map((ring: number[][]) => ({
        type: 'Feature',
        properties: { ELEVATION: c.elevation, IS_INDEX: c.isIndex ? 1 : 0 },
        geometry: { type: 'LineString', coordinates: ring }
      }))
    )

    const spotPoints = spotHeights.map((pt: any) => ({
      type: 'Feature',
      properties: { ELEVATION: pt.z, LABEL: pt.label ?? '' },
      geometry: { type: 'Point', coordinates: [pt.e, pt.n] }
    }))

    const geojson = {
      type: 'FeatureCollection',
      features: [...contourLines, ...spotPoints]
    }

    return NextResponse.json(geojson)
  } catch (error) {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
