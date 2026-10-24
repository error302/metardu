import { z } from 'zod'
import { mapFeatureCollectionSchema } from '@/lib/validation/mapDrawing'

export type MapFeatureCollection = z.infer<typeof mapFeatureCollectionSchema>
const finiteOrNull = z.number().finite().nonnegative().nullable()
export const mapGridMetricsSchema = z.object({
  status: z.enum(['available','unavailable']), areaSqM: finiteOrNull,
  polygonBoundaryLengthM: finiteOrNull, lineLengthM: finiteOrNull, totalLengthM: finiteOrNull,
  crs: z.string().nullable(), reason: z.string().optional(),
})
export const mapDrawingReplySchema = z.object({
  projectId: z.string(), viewerId: z.string(), name: z.string(), version: z.string().regex(/^[a-f0-9]{64}$/),
  features: mapFeatureCollectionSchema, coordinateCrs: z.literal('EPSG:4326'),
  referenceSource: z.enum(['declared','legacy','missing']), metrics: mapGridMetricsSchema,
})
export type MapDrawingReply = z.infer<typeof mapDrawingReplySchema>
export const mapDrawingWriteSchema = z.object({
  baseVersion: z.string().regex(/^[a-f0-9]{64}$/), features: mapFeatureCollectionSchema,
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value.features)).length <= 4*1024*1024, 'The drawing exceeds the 4 MiB save limit. Retain it and split it before saving.')

export function readMapDrawingReply(value: unknown, projectId: string): MapDrawingReply {
  const parsed = mapDrawingReplySchema.safeParse(value)
  if (!parsed.success || parsed.data.projectId !== projectId) throw new Error('The project drawing response was not confirmed. The local drawing is retained.')
  const m = parsed.data.metrics
  if (m.status === 'available' && (!m.crs || [m.areaSqM,m.polygonBoundaryLengthM,m.lineLengthM,m.totalLengthM].some(n => n == null))
    || m.status === 'unavailable' && [m.areaSqM,m.polygonBoundaryLengthM,m.lineLengthM,m.totalLengthM].some(n => n != null)) {
    throw new Error('The drawing measurements were not confirmed.')
  }
  return parsed.data
}
