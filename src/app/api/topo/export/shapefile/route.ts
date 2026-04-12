import { NextRequest, NextResponse } from 'next/server'
import type { ContourLine } from '@/lib/topo/contourGenerator'

interface SpotHeightInput {
  e: number
  n: number
  z: number
  label?: string
}

export async function POST(req: NextRequest) {
  try {
    const { contours, spotHeights, projectId } = await req.json() as {
      contours: ContourLine[]
      spotHeights: SpotHeightInput[]
      projectId?: string
    }

    const contourFeatures = contours.flatMap((contour) =>
      contour.coordinates.map((ring) => ({
        type: 'Feature' as const,
        properties: {
          ELEVATION: contour.elevation,
          IS_INDEX: contour.isIndex ? 1 : 0,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: ring,
        },
      }))
    )

    const spotFeatures = spotHeights.map((pt) => ({
      type: 'Feature' as const,
      properties: {
        ELEVATION: pt.z,
        LABEL: pt.label ?? '',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [pt.e, pt.n],
      },
    }))

    const geojson = {
      type: 'FeatureCollection' as const,
      features: [...contourFeatures, ...spotFeatures],
    }

    const shpwriteModule = await import('shp-write')
    const shpwrite = (shpwriteModule as any).default ?? shpwriteModule

    if (typeof shpwrite.zip !== 'function') {
      throw new Error('shp-write zip() is unavailable')
    }

    const zipResult = await shpwrite.zip(geojson, {
      folder: `contours_${projectId ?? 'export'}`,
      types: {
        point: 'spot_heights',
        line: 'contours',
        polygon: 'polygons',
      },
    })

    const zipBuffer = Buffer.isBuffer(zipResult)
      ? zipResult
      : Buffer.from(zipResult)

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="contours_${projectId ?? 'export'}.zip"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shapefile generation failed'
    console.error('Shapefile export error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
