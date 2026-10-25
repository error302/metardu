import { z } from 'zod'
export const SCHEME_SHAPE_LIMIT = 50,
  SCHEME_GROUP_LIMIT = 500,
  SCHEME_VERTEX_LIMIT = 30000,
  SCHEME_GEOMETRY_BYTES = 2097152
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const schemeBboxSchema = z
  .tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ])
  .refine(([a, b, c, d]) => a < c && b < d)
const frame = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  crs: z.string(),
  referenceHash: hash,
})
export const schemeExtentSchema = frame
  .extend({
    mode: z.literal('extent'),
    extent: schemeBboxSchema.nullable(),
    totalParcels: count,
    geometryRecords: count,
    otherReferenceRecords: count,
    missingGeometry: count,
    unplottableGeometry: count,
  })
  .refine(
    (value) =>
      value.totalParcels ===
        value.geometryRecords +
          value.otherReferenceRecords +
          value.missingGeometry +
          value.unplottableGeometry &&
      value.geometryRecords > 0 === (value.extent !== null),
  )
const position = z.tuple([z.number().finite(), z.number().finite()])
const ring = z
  .array(position)
  .min(4)
  .max(5001)
  .refine(
    (points) =>
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1],
  )
export const schemeParcelFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    id: z.string().uuid(),
    geometry: z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(ring).min(1).max(50),
    }),
    properties: z.object({
      kind: z.literal('parcel'),
      parcelId: z.string().uuid(),
      parcelNumber: z.string(),
      blockId: z.string().uuid().nullable(),
      blockNumber: z.string().nullable(),
      recordedStatus: z.string().nullable(),
      suppliedAreaHa: z.string().nullable(),
      gridAreaSqM: z.number().finite().positive(),
      evidenceState: z.enum([
        'reviewed_draft',
        'changed_since_review',
        'unassessed_geometry',
      ]),
      receiptId: z.string().uuid().nullable(),
      evidenceHash: hash.nullable(),
      geometryHash: hash,
      revision: count,
      updatedAt: z.string().datetime({ offset: true }),
      canSnap: z.boolean(),
      assessment: z.literal('unverified'),
    }),
  })
  .refine(
    (feature) =>
      feature.id === feature.properties.parcelId &&
      feature.properties.canSnap ===
        (feature.properties.evidenceState === 'reviewed_draft') &&
      (feature.properties.evidenceState !== 'reviewed_draft' ||
        (feature.properties.receiptId !== null &&
          feature.properties.evidenceHash !== null)),
  )
export const schemeGroupFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('Point'), coordinates: position }),
  properties: z.object({
    kind: z.literal('density'),
    count: count.refine((value) => value > 0),
    extent: schemeBboxSchema,
    displayOnly: z.literal(true),
  }),
})
export const schemeViewportSchema = frame
  .extend({
    mode: z.enum(['polygons', 'density']),
    type: z.literal('FeatureCollection'),
    bbox: schemeBboxSchema.nullable(),
    selection: z
      .array(z.string().uuid())
      .min(1)
      .max(SCHEME_SHAPE_LIMIT)
      .nullable(),
    matchingRecords: count,
    representedRecords: count,
    omittedRecords: count,
    partial: z.boolean(),
    history: z.enum(['available', 'unavailable']),
    features: z
      .array(z.union([schemeParcelFeatureSchema, schemeGroupFeatureSchema]))
      .max(SCHEME_GROUP_LIMIT),
  })
  .refine(
    (value) =>
      ((value.bbox !== null && value.selection === null) ||
        (value.bbox === null &&
          value.selection !== null &&
          value.mode === 'polygons')) &&
      value.representedRecords + value.omittedRecords ===
        value.matchingRecords &&
      value.partial === value.omittedRecords > 0 &&
      (value.mode === 'polygons'
        ? value.features.length <= SCHEME_SHAPE_LIMIT &&
          value.features.every(
            (feature) => feature.properties.kind === 'parcel',
          ) &&
          value.representedRecords === value.features.length &&
          new Set(
            value.features
              .filter((feature) => feature.properties.kind === 'parcel')
              .map((feature) => ('id' in feature ? feature.id : '')),
          ).size === value.features.length
        : value.features.every(
            (feature) => feature.properties.kind === 'density',
          ) &&
          value.representedRecords ===
            value.features.reduce(
              (sum, feature) =>
                sum +
                (feature.properties.kind === 'density'
                  ? feature.properties.count
                  : 0),
              0,
            )),
  )
  .refine(
    (value) =>
      value.features.reduce(
        (sum, feature) =>
          sum +
          (feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates.reduce(
                (vertices, points) => vertices + points.length,
                0,
              )
            : 0),
        0,
      ) <= SCHEME_VERTEX_LIMIT,
  )
  .refine(
    (value) =>
      value.history === 'available' ||
      value.features.every(
        (feature) =>
          feature.properties.kind !== 'parcel' ||
          feature.properties.evidenceState === 'unassessed_geometry',
      ),
  )
export type SchemeExtent = z.infer<typeof schemeExtentSchema>
export type SchemeViewport = z.infer<typeof schemeViewportSchema>
export type SchemeParcelFeature = z.infer<typeof schemeParcelFeatureSchema>
export type SchemeGroupFeature = z.infer<typeof schemeGroupFeatureSchema>
export type SchemeViewQuery =
  | { mode: 'extent' }
  | { bbox: [number, number, number, number]; cellSize: number }
export function schemeViewMessage(view: SchemeViewport): string {
  const stateCounts = {
    reviewed_draft: 0,
    changed_since_review: 0,
    unassessed_geometry: 0,
  }
  for (const feature of view.features)
    if (feature.properties.kind === 'parcel')
      stateCounts[feature.properties.evidenceState]++
  const parts = [
    view.mode === 'density'
      ? `${view.representedRecords.toLocaleString()} stored geometry records represented by ${view.features.length.toLocaleString()} visual groups. Zoom in for individual polygons.`
      : `${view.features.length.toLocaleString()} stored polygons in view: ${stateCounts.reviewed_draft} reviewed drafts, ${stateCounts.changed_since_review} changed since review, ${stateCounts.unassessed_geometry} unassessed.`,
  ]
  if (view.partial)
    parts.push(
      `${view.omittedRecords.toLocaleString()} records are not drawn in this view; zoom in or review detailed geometry separately.`,
    )
  if (view.history === 'unavailable')
    parts.push('Review history is unavailable; stored shapes are unassessed.')
  return parts.join(' ')
}
