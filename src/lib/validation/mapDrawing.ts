import { z } from 'zod'
import type { Geometry } from 'geojson'

/** GeoJSON is stored in longitude/latitude; projected metrics carry their own CRS. */
function validGeometry(value: unknown, depth = 0, budget = { positions: 0 }): value is Geometry {
  if (!value || typeof value !== 'object' || depth > 8) return false
  const geometry = value as Record<string, unknown>
  const position = (point: unknown): boolean => {
    if (++budget.positions > 100000 || !Array.isArray(point) || point.length < 2 || !point.every(n => typeof n === 'number' && Number.isFinite(n))) return false
    return Math.abs(point[0] as number) <= 180 && Math.abs(point[1] as number) <= 90
  }
  const line = (points: unknown, minimum: number): boolean => Array.isArray(points) && points.length >= minimum && points.every(position)
  const ring = (points: unknown): boolean => line(points, 4) && JSON.stringify((points as unknown[])[0]) === JSON.stringify((points as unknown[]).at(-1))
  const polygon = (rings: unknown): boolean => Array.isArray(rings) && rings.length > 0 && rings.every(ring)
  switch (geometry.type) {
    case 'Point': return position(geometry.coordinates)
    case 'MultiPoint': return line(geometry.coordinates, 1)
    case 'LineString': return line(geometry.coordinates, 2)
    case 'MultiLineString': return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(points => line(points, 2))
    case 'Polygon': return polygon(geometry.coordinates)
    case 'MultiPolygon': return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(polygon)
    case 'GeometryCollection': return Array.isArray(geometry.geometries) && geometry.geometries.length > 0 && geometry.geometries.every(child => validGeometry(child, depth + 1, budget))
    default: return false
  }
}

export const displayCircleSchema = z.object({
  type:z.literal('Circle'),coordinateCrs:z.literal('EPSG:3857'),
  center:z.array(z.number().finite()).min(2).max(4),radius:z.number().finite().nonnegative(),
}).strict()
export const mapFeatureCollectionSchema = z.object({
    type: z.literal('FeatureCollection'),
    features: z.array(z.object({
      type: z.literal('Feature'), geometry: z.custom<Geometry|null>(value => value === null || validGeometry(value), 'Drawing geometry must contain finite, valid longitude/latitude coordinates'),
      properties: z.record(z.unknown()).nullable(), id: z.union([z.string(), z.number().finite()]).optional(),
    }).passthrough().superRefine((feature,context)=>{
      if(feature.geometry===null&&!displayCircleSchema.safeParse(feature.metarduDisplayGeometry).success) context.addIssue({code:z.ZodIssueCode.custom,message:'A geometry-less feature needs an explicit retained display-circle definition.'})
    })).max(5000),
  }).passthrough()
const withinSaveLimit = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length <= 4 * 1024 * 1024

export const mapDrawingSchema = z.object({
  source: z.literal('map-drawing'), createdFrom: z.literal('map-client'),
  coordinateCrs: z.literal('EPSG:4326'), measurementCrs: z.string().min(1),
  drawnFeatures: mapFeatureCollectionSchema.refine(value => value.features.length > 0, 'Draw at least one feature'),
  drawnAreaSqM: z.number().finite().nonnegative().nullable(), drawnPerimeterM: z.number().finite().nonnegative().nullable(),
}).strict().refine(withinSaveLimit, 'Drawing exceeds the 4 MiB save limit; retain it and split it into smaller drawings')

/** A site sketch may be retained before survey control has established a grid. */
export const reconnaissanceDrawingSchema = z.object({
  source: z.literal('site-reconnaissance'), createdFrom: z.literal('project-create-map'),
  coordinateCrs: z.literal('EPSG:4326'), evidenceStatus: z.literal('reconnaissance_unverified'),
  areaMethod: z.literal('spherical-geodesic-preview'), estimatedAreaSqM: z.number().finite().nonnegative(),
  drawnFeatures: mapFeatureCollectionSchema.refine(value => value.features.length > 0, 'Draw at least one feature'),
}).strict().refine(withinSaveLimit, 'Site sketch exceeds the 4 MiB save limit; retain it and split it into smaller drawings')

export function siteReconnaissanceDrawing(coordinates: number[][], estimatedAreaSqM: number | null) {
  if (!coordinates.length) return undefined
  return reconnaissanceDrawingSchema.parse({
    source: 'site-reconnaissance', createdFrom: 'project-create-map', coordinateCrs: 'EPSG:4326',
    evidenceStatus: 'reconnaissance_unverified', areaMethod: 'spherical-geodesic-preview', estimatedAreaSqM,
    drawnFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'site-sketch' }, geometry: { type: 'Polygon', coordinates: [coordinates] } }] },
  })
}
