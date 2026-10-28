/** Spherical area and length estimates from OpenLayers ol/sphere.
 * These use the mean Earth radius, not an ellipsoidal cadastral adjustment.
 * Callers must declare the geometry CRS; no accuracy or registry approval is inferred.
 */

import { getArea, getLength } from 'ol/sphere'
import type { Polygon, LineString } from 'ol/geom'
import type { ProjectionLike } from 'ol/proj'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'

export interface GeodesicMetrics {
  /** Spherical surface area in square meters */
  areaSqM: number
  /** Area in hectares (4 decimal places) */
  areaHectares: number
  /** Area in acres (for reference) */
  areaAcres: number
  /** Spherical geodesic perimeter in meters */
  perimeterM: number
  /** Number of vertices */
  vertexCount: number
  /** Whether the computation used geodesic (true) or planar (false) method */
  isGeodesic: boolean
  /** Estimated error in m² (based on coordinate precision) */
  estimatedErrorSqM: number | null
  model: 'mean-earth-sphere'
}

/**
 * Compute geodesic area and perimeter of a polygon.
 *
 * This uses ol/sphere.getArea() which computes the spherical
 * surface area, correcting for projection distortion.
 *
 * @param geometry - OpenLayers Polygon geometry
 * @param projection - Declared geometry CRS
 * @returns Geodesic metrics with area in m², ha, and acres
 */
export function calculateGeodesicArea(
  geometry: Polygon,
  projection: ProjectionLike,
): GeodesicMetrics {
  if (!projection) throw new RangeError('A geometry CRS is required');
  // ol/sphere.getArea handles projection transformation
  const areaSqM = getArea(geometry, { projection })

  // Geodesic perimeter
  const perimeterM = getLength(geometry, { projection })

  if (!Number.isFinite(areaSqM) || !Number.isFinite(perimeterM)) throw new RangeError('Geometry produced non-finite metrics');

  // Vertex count
  const coords = geometry.getCoordinates()
  const ring = coords[0] || []
  const vertexCount = ring.length > 0 ? ring.length - 1 : 0 // exclude closing point

  const estimatedErrorSqM = null

  return {
    areaSqM,
    areaHectares: parseFloat((areaSqM / 10000).toFixed(4)),
    areaAcres: parseFloat((areaSqM / 4046.86).toFixed(4)),
    perimeterM,
    vertexCount,
    isGeodesic: true,
    estimatedErrorSqM,
    model: 'mean-earth-sphere',
  }
}

/**
 * Compute geodesic length of a LineString.
 *
 * @param geometry - OpenLayers LineString geometry
 * @param projection - Map projection
 */
export function calculateGeodesicLength(
  geometry: LineString,
  projection: ProjectionLike,
): { lengthM: number; vertexCount: number } {
  if (!projection) throw new RangeError('A geometry CRS is required');
  const lengthM = getLength(geometry, { projection })
  const coords = geometry.getCoordinates()
  return {
    lengthM,
    vertexCount: coords.length,
  }
}

/**
 * Compare planar (Shoelace) vs geodesic area to show the distortion error.
 *
 * This is useful for QA/QC — the difference quantifies model/projection disagreement.
 * It cannot determine registry acceptance.
 *
 * @param geometry - OpenLayers Polygon geometry
 * @param projection - Map projection
 */
export function compareAreaMethods(
  geometry: Polygon,
  projection: ProjectionLike,
): {
  geodesic: GeodesicMetrics
  planar: { areaSqM: number; areaHectares: number }
  differenceSqM: number
  differenceHa: number
  distortionPercent: number
  registryCompliant: boolean
} {
  if (!projection) throw new RangeError('A geometry CRS is required');
  assertProjectedCrs(typeof projection === 'string' ? projection : projection.getCode());
  const geodesic = calculateGeodesicArea(geometry, projection)

  // Planar area (Shoelace in projected coordinates)
  const planarAreaSqM = geometry.getArea()

  const differenceSqM = Math.abs(geodesic.areaSqM - planarAreaSqM)
  const differenceHa = differenceSqM / 10000
  const distortionPercent = geodesic.areaSqM > 0
    ? (differenceSqM / geodesic.areaSqM) * 100
    : 0

  return {
    geodesic,
    planar: {
      areaSqM: planarAreaSqM,
      areaHectares: parseFloat((planarAreaSqM / 10000).toFixed(4)),
    },
    differenceSqM,
    differenceHa: parseFloat(differenceHa.toFixed(6)),
    distortionPercent: parseFloat(distortionPercent.toFixed(4)),
    registryCompliant: false, // Numerical agreement alone cannot establish statutory compliance.
  }
}

/**
 * Format area for Kenya statutory documents.
 *
 * Display conventions (not a statutory acceptance decision):
 * - Areas < 1 ha: show in m² with 2 decimal places
 * - Areas ≥ 1 ha: show in hectares with 4 decimal places
 * - Always show both for reference
 */
export function formatAreaForStatutory(areaSqM: number): {
  primary: string
  secondary: string
  full: string
} {
  const ha = areaSqM / 10000

  if (ha < 1) {
    return {
      primary: `${areaSqM.toFixed(2)} m²`,
      secondary: `${ha.toFixed(4)} ha`,
      full: `${areaSqM.toFixed(2)} m² (${ha.toFixed(4)} ha)`,
    }
  }

  return {
    primary: `${ha.toFixed(4)} ha`,
    secondary: `${areaSqM.toFixed(2)} m²`,
    full: `${ha.toFixed(4)} ha (${areaSqM.toFixed(2)} m²)`,
  }
}
