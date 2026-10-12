export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setCurrentUserId } from '@/lib/db'
import type { ContourLine } from '@/lib/topo/contourGenerator'
import { logger } from '@/lib/logger'

interface SpotHeightInput {
  e: number
  n: number
  z: number
  label?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = session.user.id
  if (userId) setCurrentUserId(String(userId))

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
    const shpwrite = (shpwriteModule as unknown as { default?: typeof import('shp-write') }).default ?? shpwriteModule

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

    // Register the issued shapefile against its surface revision (blueprint §15/§28).
    let registerWarning: string | null = null
    try {
      const { currentDesignRevision } = await import('@/lib/engineering/designRevisions')
      const { registerDeliverable } = await import('@/lib/deliverables/deliverableRegister')
      const design = await currentDesignRevision(String(projectId), 'surface')
      const registered = await registerDeliverable({
        projectId: String(projectId),
        documentType: 'other',
        content: zipBuffer,
        title: 'Topographic contours shapefile',
        sourceRevision: design?.revision ?? null,
        projectCrs: design?.crs ?? null,
        generator: 'api/topo/export/shapefile',
        manifest: { contour_count: contours.length, format: 'shapefile-zip' },
        userId: userId ? String(userId) : null,
      })
      logger.info('[topo/export/shapefile] registered', {
        deliverable: registered.deliverable.id,
        revision: registered.revision.revision,
      })
    } catch (error) {
      registerWarning = error instanceof Error ? error.message : 'register failed'
      logger.error('[topo/export/shapefile] deliverable not registered', { error })
    }

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="contours_${projectId ?? 'export'}.zip"`,
        ...(registerWarning ? { 'X-Metardu-Register-Warning': registerWarning } : {}),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shapefile generation failed'
    logger.error('Shapefile export error:', { error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
