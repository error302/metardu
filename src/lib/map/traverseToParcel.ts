'use client'
import { z } from 'zod'
import {
  assertProjectedCrs,
  surveyArea,
  surveyPerimeter,
} from '@/lib/spatial/projectCrs'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'
import {
  boundaryCommandSchema,
  boundaryReceiptSchema,
  prepareBoundary,
  type BoundaryCommand,
  type BoundarySource,
} from '@/lib/scheme/boundaryReview'
export interface TraversePoint {
  easting: number
  northing: number
  pointName: string
  rl?: number | null
}
export interface TraverseToParcelResult {
  polygon: GeoJSON.Polygon
  area: number
  perimeter: number
  pointCount: number
}
export class BoundarySaveRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BoundarySaveRefusal'
  }
}
export function traversePointsToPolygon(
  points: TraversePoint[],
): GeoJSON.Polygon {
  if (!isSimplePolygonRing(points))
    throw new Error(
      'Review at least three finite, distinct vertices in a simple boundary order.',
    )
  const ring = points.map((point) => [point.easting, point.northing])
  return { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] }
}
export function calculatePolygonArea(
  points: Array<{ easting: number; northing: number }>,
  crs: string,
) {
  return surveyArea(
    points.map((point) => [point.easting, point.northing]),
    crs,
  )
}
export function calculatePolygonPerimeter(
  points: Array<{ easting: number; northing: number }>,
  crs: string,
) {
  return surveyPerimeter(
    points.map((point) => [point.easting, point.northing]),
    crs,
  )
}
export function traverseToParcelResult(
  points: TraversePoint[],
  crs: string,
): TraverseToParcelResult {
  return {
    polygon: traversePointsToPolygon(points),
    area: calculatePolygonArea(points, crs),
    perimeter: calculatePolygonPerimeter(points, crs),
    pointCount: points.length,
  }
}

/** A saved draft is returned only after the exact reviewed command is acknowledged. */
export async function createParcelFromTraverse(
  projectId: string,
  parcelId: string,
  review?: { command: BoundaryCommand; source: BoundarySource },
) {
  if (!review)
    throw new Error(
      'Choose a parcel and review its source grid and ordered vertices in Boundary review before saving.',
    )
  const command = boundaryCommandSchema.parse(review.command),
    source = review.source
  if (
    source.projectId !== projectId ||
    source.parcelId !== parcelId ||
    command.parcel_id !== parcelId ||
    command.traverse_id !== source.traverseId ||
    command.evidence_hash !== source.evidenceHash
  )
    throw new Error(
      'The reviewed boundary does not match this project, parcel and traverse.',
    )
  const expected = prepareBoundary(
    source,
    command.ordered_coordinate_ids,
    command.source_crs,
  )
  const response = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/scheme/parcel-boundary`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
  )
  const body: unknown = await response.json()
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body)
    const message = parsed.success
      ? parsed.data.error
      : 'The boundary draft save is unconfirmed. Retry this exact request.'
    if (response.status >= 400 && response.status < 500)
      throw new BoundarySaveRefusal(message, response.status)
    throw new Error(message)
  }
  const parsed = z.object({ data: boundaryReceiptSchema }).safeParse(body)
  if (!parsed.success)
    throw new Error(
      'The boundary draft save acknowledgement is invalid. Retry this exact request.',
    )
  const row = parsed.data.data
  if (
    row.projectId !== projectId ||
    row.parcelId !== parcelId ||
    row.traverseId !== source.traverseId ||
    row.requestId !== command.request_id ||
    row.evidenceHash !== source.evidenceHash ||
    row.sourceCrs !== command.source_crs ||
    row.parcelRevision !== source.parcelRevision + 1 ||
    JSON.stringify(row.orderedCoordinateIds) !==
      JSON.stringify(command.ordered_coordinate_ids) ||
    JSON.stringify(row.polygon) !== JSON.stringify(expected.polygon) ||
    row.gridAreaSqM !== expected.gridAreaSqM ||
    row.gridPerimeterM !== expected.gridPerimeterM ||
    row.areaHa !== expected.areaHa
  )
    throw new Error(
      'The saved draft acknowledgement does not match the reviewed geometry. Retry this exact request.',
    )
  return row
}

/** Optional map preview; coordinates require an explicit registered project grid. */
export async function createTraversePolygonPreview(
  points: TraversePoint[],
  crs: string,
) {
  const code = assertProjectedCrs(crs).code,
    polygon = traversePointsToPolygon(points)
  const [
    { default: VectorSource },
    { default: VectorLayer },
    { default: Feature },
    { default: Polygon },
    { transform },
    styles,
  ] = await Promise.all([
    import('ol/source/Vector'),
    import('ol/layer/Vector'),
    import('ol/Feature'),
    import('ol/geom/Polygon'),
    import('ol/proj'),
    import('ol/style'),
  ])
  // Register the same authority definition used by project map layers.
  const { registerProjections } = await import('@/lib/map/projection')
  await registerProjections()
  const ring = polygon.coordinates[0].map((coordinate) =>
    transform(coordinate, code, 'EPSG:3857'),
  )
  if (ring.some((coordinate) => !coordinate.every(Number.isFinite)))
    throw new Error(
      'The boundary cannot be transformed for display in this map.',
    )
  const feature = new Feature({ geometry: new Polygon([ring]) }),
    source = new VectorSource({ features: [feature] })
  const layer = new VectorLayer({
    source,
    zIndex: 50,
    style: new styles.Style({
      fill: new styles.Fill({ color: 'rgba(209,123,71,0.15)' }),
      stroke: new styles.Stroke({
        color: '#D17B47',
        width: 2.5,
        lineDash: [8, 4],
      }),
    }),
  })
  return { source, layer }
}
export function removeTraversePolygonPreview(
  map: import('ol/Map').default | null,
  layer: import('ol/layer/Vector').default | null,
) {
  if (map && layer) map.removeLayer(layer)
}
