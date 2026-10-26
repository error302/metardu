import { z } from 'zod'
import {
  assertProjectedCrs,
  surveyArea,
  surveyPerimeter,
} from '@/lib/spatial/projectCrs'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'

export const BOUNDARY_VERTEX_LIMIT = 500
export const boundaryCommandSchema = z
  .object({
    parcel_id: z.string().uuid(),
    traverse_id: z.string().uuid(),
    request_id: z.string().uuid(),
    evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
    source_crs: z.string().min(1).max(32),
    ordered_coordinate_ids: z
      .array(z.string().uuid())
      .min(3)
      .max(BOUNDARY_VERTEX_LIMIT),
    reviewed: z.literal(true),
    note: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.ordered_coordinate_ids).size ===
      value.ordered_coordinate_ids.length,
    'Choose each boundary vertex once; closure is automatic.',
  )
export type BoundaryCommand = z.infer<typeof boundaryCommandSchema>
export const boundaryPointSchema = z.object({
  id: z.string().uuid(),
  station: z.string().nullable(),
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().finite().nullable(),
})
export const boundarySourceSchema = z.object({
  storageReady: z.boolean(),
  observationCount: z.number().int().nonnegative().max(2000),
  projectId: z.string().uuid(),
  parcelId: z.string().uuid(),
  parcelNumber: z.string(),
  blockId: z.string().uuid().nullable(),
  parcelStatus: z.string().nullable(),
  parcelRevision: z.number().int().nonnegative(),
  traverseId: z.string().uuid(),
  sourceCrs: z.string(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  points: z.array(boundaryPointSchema).max(BOUNDARY_VERTEX_LIMIT),
})
export type BoundarySource = z.infer<typeof boundarySourceSchema>
const count = z.number().int().nonnegative()
export const boundaryDirectorySchema = z
  .object({
    projectId: z.string().uuid(),
    parcelId: z.string().uuid(),
    parcelNumber: z.string(),
    page: z.number().int().positive(),
    pageSize: z.literal(24),
    total: count,
    traverses: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().nullable(),
          status: z.string().nullable(),
          pointCount: count,
        }),
      )
      .max(24),
  })
  .refine(
    (value) =>
      value.page <= Math.max(1, Math.ceil(value.total / 24)) &&
      value.traverses.length ===
        Math.min(24, Math.max(0, value.total - (value.page - 1) * 24)) &&
      new Set(value.traverses.map((row) => row.id)).size ===
        value.traverses.length,
  )
export const boundaryReceiptSchema = z.object({
  protocol: z.literal('reviewed-parcel-boundary-v1'),
  receiptId: z.string().uuid(),
  requestId: z.string().uuid(),
  projectId: z.string().uuid(),
  parcelId: z.string().uuid(),
  traverseId: z.string().uuid(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceCrs: z.string(),
  orderedCoordinateIds: z
    .array(z.string().uuid())
    .min(3)
    .max(BOUNDARY_VERTEX_LIMIT),
  polygon: z.object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(z.array(z.tuple([z.number().finite(), z.number().finite()])))
      .length(1),
  }),
  gridAreaSqM: z.number().finite().positive(),
  gridPerimeterM: z.number().finite().positive(),
  areaHa: z.number().finite().positive(),
  parcelRevision: z.number().int().nonnegative(),
  parcelUpdatedAt: z
    .string()
    .datetime({ offset: true })
    .regex(/\.\d{6}Z$/),
  status: z.literal('draft_unverified'),
})
export type BoundaryReceipt = z.infer<typeof boundaryReceiptSchema>

/** The selected IDs, not station labels or query order, define this draft ring. */
export function prepareBoundary(
  source: BoundarySource,
  ids: readonly string[],
  crs: string,
) {
  const resolved = assertProjectedCrs(crs).code
  if (resolved !== source.sourceCrs)
    throw new Error(
      'The declared source grid must match the saved project reference.',
    )
  if (
    ids.length < 3 ||
    ids.length > BOUNDARY_VERTEX_LIMIT ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Choose 3–500 distinct boundary vertices in order.')
  const lookup = new Map(source.points.map((point) => [point.id, point]))
  const points = ids.map((id) => {
    const point = lookup.get(id)
    if (!point)
      throw new Error(
        'A selected vertex is absent from this retained traverse.',
      )
    return point
  })
  if (!isSimplePolygonRing(points))
    throw new Error(
      'The chosen boundary crosses itself, repeats a location or has zero area. Review the vertex order.',
    )
  const ring = points.map(
    (point) => [point.easting, point.northing] as [number, number],
  )
  const gridAreaSqM = surveyArea(ring, resolved),
    gridPerimeterM = surveyPerimeter(ring, resolved)
  const areaHa = gridAreaSqM / 10000
  if (
    !Number.isFinite(gridAreaSqM) ||
    !Number.isFinite(gridPerimeterM) ||
    !Number.isFinite(areaHa) || areaHa <= 0
  )
    throw new Error(
      'The draft area is zero or nonfinite.',
    )
  return {
    polygon: {
      type: 'Polygon' as const,
      coordinates: [[...ring, [...ring[0]] as [number, number]]],
    },
    gridAreaSqM,
    gridPerimeterM,
    areaHa,
  }
}
