import { createHash } from 'node:crypto'
import { assertProjectedCrs, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import type { DrainageAlignmentVertex } from './drainageAlignment'

export interface ProjectMapDrainageAlignment {
  featureKey: string
  label: string
  sourceCrs: 'EPSG:4326'
  projectCrs: string
  vertices: DrainageAlignmentVertex[]
}

export interface ProjectMapDrainageAlignmentResult {
  alignments: ProjectMapDrainageAlignment[]
  warnings: string[]
}

const MAX_ALIGNMENT_FEATURES = 250
const MAX_VERTICES_PER_ALIGNMENT = 5_000
const MAX_TOTAL_VERTICES = 20_000

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function unknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function readableLabel(properties: Record<string, unknown> | null, fallback: string): string {
  for (const key of ['name', 'title', 'label', 'featureName']) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120)
  }
  return fallback
}

/**
 * Extract only saved GeoJSON LineStrings suitable for drainage alignment
 * selection. Project map drawings are RFC 7946 WGS84; survey coordinates are
 * transformed here on the server into the project's declared projected CRS.
 * Unsupported, invalid, or excessively large features are omitted with a
 * visible warning rather than silently treated as engineering design.
 */
export function extractProjectMapDrainageAlignments(
  drawnFeatures: unknown,
  projectCrs: string,
): ProjectMapDrainageAlignmentResult {
  const crs = assertProjectedCrs(projectCrs)
  if (crs.units !== 'metres') throw new Error(`${crs.code} is not a projected metre CRS.`)

  const collection = objectRecord(drawnFeatures)
  const rawFeatures = Array.isArray(collection?.features) ? collection.features : []
  const alignments: ProjectMapDrainageAlignment[] = []
  const warnings = new Set<string>()
  let totalVertices = 0
  let omittedFeatures = 0

  for (const [index, rawFeature] of rawFeatures.entries()) {
    const feature = objectRecord(rawFeature)
    const geometry = objectRecord(feature?.geometry)
    if (!feature || geometry?.type !== 'LineString' || !unknownArray(geometry.coordinates)) continue

    const coordinates = geometry.coordinates
    if (coordinates.length < 2) {
      warnings.add(`Saved map line ${index + 1} was skipped because it has fewer than two vertices.`)
      omittedFeatures += 1
      continue
    }
    if (coordinates.length > MAX_VERTICES_PER_ALIGNMENT || totalVertices + coordinates.length > MAX_TOTAL_VERTICES) {
      warnings.add(`Saved map line ${index + 1} was skipped because the drainage alignment import limit was reached.`)
      omittedFeatures += 1
      continue
    }

    const vertices: DrainageAlignmentVertex[] = []
    let invalidReason: string | null = null
    const transformWarnings = new Set<string>()
    for (const [vertexIndex, rawPosition] of coordinates.entries()) {
      if (!unknownArray(rawPosition) || rawPosition.length < 2) {
        invalidReason = `vertex ${vertexIndex + 1} is not a longitude/latitude pair`
        break
      }
      const longitude = rawPosition[0]
      const latitude = rawPosition[1]
      if (typeof longitude !== 'number' || typeof latitude !== 'number'
        || !Number.isFinite(longitude) || !Number.isFinite(latitude)
        || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        invalidReason = `vertex ${vertexIndex + 1} is outside valid WGS84 longitude/latitude ranges`
        break
      }
      const [easting, northing] = transformPoint(longitude, latitude, 'EPSG:4326', crs.code)
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
        invalidReason = `vertex ${vertexIndex + 1} did not transform to finite project coordinates`
        break
      }
      const range = validateCoordinateRange(easting, northing, crs.code)
      if (!range.valid) {
        invalidReason = `vertex ${vertexIndex + 1} is outside ${crs.code}: ${range.errors.join('; ')}`
        break
      }
      range.warnings.forEach(warning => transformWarnings.add(warning))
      if (vertices.length > 0 && Math.hypot(easting - vertices[vertices.length - 1].easting, northing - vertices[vertices.length - 1].northing) <= 1e-9) {
        invalidReason = `consecutive vertices ${vertexIndex} and ${vertexIndex + 1} are coincident`
        break
      }
      vertices.push({ easting, northing })
    }

    if (!invalidReason && vertices.length >= 2) {
      const first = vertices[0]
      const last = vertices[vertices.length - 1]
      if (Math.hypot(first.easting - last.easting, first.northing - last.northing) <= 1e-6) {
        invalidReason = 'closed lines are not accepted as pipe alignments'
      }
    }
    if (invalidReason) {
      warnings.add(`Saved map line ${index + 1} was skipped: ${invalidReason}.`)
      omittedFeatures += 1
      continue
    }

    transformWarnings.forEach(warning => warnings.add(warning))
    const properties = objectRecord(feature.properties)
    const featureId = typeof feature.id === 'string' || typeof feature.id === 'number'
      ? String(feature.id)
      : `index-${index + 1}`
    const geometryHash = createHash('sha256').update(JSON.stringify(coordinates)).digest('hex').slice(0, 16)
    alignments.push({
      featureKey: `map-line:${featureId}:${geometryHash}`,
      label: readableLabel(properties, `Saved map line ${index + 1}`),
      sourceCrs: 'EPSG:4326',
      projectCrs: crs.code,
      vertices,
    })
    totalVertices += coordinates.length
    if (alignments.length >= MAX_ALIGNMENT_FEATURES) {
      if (rawFeatures.length > index + 1) warnings.add('Only the first 250 saved map lines are available for drainage alignment selection.')
      break
    }
  }

  if (omittedFeatures > 0) warnings.add(`${omittedFeatures} saved map line(s) were omitted; review the line geometry before using it for drainage.`)
  return { alignments, warnings: [...warnings] }
}
