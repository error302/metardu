import { createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { mapFeatureCollectionSchema } from '@/lib/validation/mapDrawing'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { measureMapGridDrawing } from './metrics'
import type { MapDrawingReply, MapFeatureCollection } from './wire'

export interface DrawingProjectRow {
  id: string; user_id: string | null; name: string
  datum: string | null; utm_zone: number | null; hemisphere: string | null
  boundary_data: unknown; reference: Record<string, unknown> | null
}
export function drawingBoundary(value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The stored project data needs review. Download it before attempting a repair.')
  return value as Record<string, unknown>
}
export function projectDrawingVersion(row: DrawingProjectRow): string {
  const bd = drawingBoundary(row.boundary_data)
  return createHash('sha256').update(canonicalJson({
    projectId:row.id, owner:row.user_id, features:bd.drawnFeatures ?? null,
    coordinateCrs:bd.coordinateCrs ?? null, mapDrawing:bd.mapDrawing ?? null,
    reference:row.reference, datum:row.datum, zone:row.utm_zone, hemisphere:row.hemisphere,
  })).digest('hex')
}
export function projectDrawingSnapshot(row: DrawingProjectRow, viewerId: string): MapDrawingReply {
  const bd = drawingBoundary(row.boundary_data)
  const features = mapFeatureCollectionSchema.parse(bd.drawnFeatures ?? { type:'FeatureCollection',features:[] })
  const drawingMetadata = bd.mapDrawing && typeof bd.mapDrawing === 'object' && !Array.isArray(bd.mapDrawing) ? bd.mapDrawing as Record<string, unknown> : null
  const coordinateCrs = drawingMetadata?.coordinateCrs ?? bd.coordinateCrs
  // Legacy map saves explicitly used WGS84 GeoJSON. Other unknown geometry is not guessed.
  if (features.features.length && coordinateCrs !== 'EPSG:4326' && !(coordinateCrs == null && bd.source === 'map-drawing')) {
    throw new Error('The stored drawing coordinate CRS is unknown or unsupported. Download the original drawing for review; no grid has been assumed.')
  }
  const reference = resolveStageReference(row.reference,row)
  return {
    projectId:row.id,viewerId,name:row.name,version:projectDrawingVersion(row),features,
    coordinateCrs:'EPSG:4326',referenceSource:reference.source,
    metrics:measureMapGridDrawing(features,reference.source === 'declared' ? reference.code : null),
  }
}
export function updatedDrawingBoundary(row: DrawingProjectRow, features: MapFeatureCollection): Record<string, unknown> {
  const current = drawingBoundary(row.boundary_data)
  const reference = resolveStageReference(row.reference,row)
  const metrics = measureMapGridDrawing(features,reference.source === 'declared' ? reference.code : null)
  return { ...current,drawnFeatures:features,
    drawnAreaSqM:metrics.areaSqM,drawnPerimeterM:metrics.totalLengthM,
    mapDrawing:{ coordinateCrs:'EPSG:4326',evidenceStatus:'map_drawing_unverified',metrics },
    lastModifiedAt:new Date().toISOString(),
  }
}
