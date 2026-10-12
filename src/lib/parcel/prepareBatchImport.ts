import { computeAreaWithPrecision } from '@/lib/engine/computationalAccuracy'
import {
  transformPoint,
  validateCoordinateRange,
  validateCrsForProject,
} from '@/lib/spatial/projectCrs'

export interface ParcelBatchInput {
  parcelNumber: string
  lrNumber?: string | null
  ownerName?: string | null
  ownerId?: string | null
  areaHa?: number | null
  vertices: Array<{ easting: number; northing: number }>
}

export interface PreparedParcel {
  parcel_number: string
  lr_number: string | null
  owner_name: string | null
  owner_id: string | null
  area_ha: number
  wkt: string
  source_vertices: Array<{ easting: number; northing: number }>
  vertices: Array<{ easting: number; northing: number }>
}

export interface PreparedParcelBatch {
  parcels: PreparedParcel[]
  errors: string[]
  warnings: string[]
  transformed: boolean
}

const MAX_PARCELS = 1000
const MAX_VERTICES = 500
const MAX_BATCH_VERTICES = 50_000

/** Validate the declared source CRS, then prepare projected geometry for one atomic DB import. */
export function prepareParcelBatchImport(options: {
  parcels: unknown
  sourceCrs: string | null | undefined
  projectCrs: string
  confirmTransformation: boolean
}): PreparedParcelBatch {
  const { parcels, projectCrs, confirmTransformation } = options
  const sourceCrs = options.sourceCrs?.trim().toUpperCase()
  if (!sourceCrs) throw new Error('Declare the source EPSG code before importing parcels.')

  const compatibility = validateCrsForProject(sourceCrs, projectCrs)
  if (compatibility.level === 'error') throw new Error(compatibility.message)
  const transformed = compatibility.level === 'warning'
  if (transformed && !confirmTransformation) {
    throw new Error(`Confirm the coordinate transformation before importing. ${compatibility.message}`)
  }

  if (!Array.isArray(parcels) || parcels.length === 0) {
    throw new Error('No parcels provided.')
  }
  if (parcels.length > MAX_PARCELS) {
    throw new Error(`Maximum ${MAX_PARCELS} parcels per batch.`)
  }
  const totalVertices = parcels.reduce((total: number, parcel: unknown) => {
    if (!parcel || typeof parcel !== 'object' || Array.isArray(parcel)) return total
    const vertices = (parcel as { vertices?: unknown }).vertices
    return total + (Array.isArray(vertices) ? vertices.length : 0)
  }, 0)
  if (totalVertices > MAX_BATCH_VERTICES) {
    throw new Error(`Maximum ${MAX_BATCH_VERTICES.toLocaleString()} vertices per batch.`)
  }

  const prepared: PreparedParcel[] = []
  const errors: string[] = []
  const warnings = transformed ? [compatibility.message] : []
  const seen = new Set<string>()

  for (const [index, raw] of parcels.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`Parcel ${index + 1}: invalid record`)
      continue
    }
    const input = raw as Partial<ParcelBatchInput>
    const parcelNumber = typeof input.parcelNumber === 'string' ? input.parcelNumber.trim() : ''
    if (!parcelNumber || parcelNumber.length > 30) {
      errors.push(`Parcel ${index + 1}: parcel number is required and must be at most 30 characters`)
      continue
    }
    const key = parcelNumber.toLocaleLowerCase('en')
    if (seen.has(key)) {
      errors.push(`Parcel ${parcelNumber}: repeated in this batch`)
      continue
    }
    seen.add(key)
    if (!Array.isArray(input.vertices) || input.vertices.length < 3 || input.vertices.length > MAX_VERTICES) {
      errors.push(`Parcel ${parcelNumber}: supply 3–${MAX_VERTICES} vertices`)
      continue
    }

    const vertices: PreparedParcel['vertices'] = []
    let invalid = false
    for (const [vertexIndex, vertex] of input.vertices.entries()) {
      if (!vertex || !Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) {
        errors.push(`Parcel ${parcelNumber}: vertex ${vertexIndex + 1} has invalid coordinates`)
        invalid = true
        break
      }
      const sourceCheck = validateCoordinateRange(vertex.easting, vertex.northing, sourceCrs)
      if (!sourceCheck.valid) {
        errors.push(`Parcel ${parcelNumber}: vertex ${vertexIndex + 1}: ${sourceCheck.errors.join('; ')}`)
        invalid = true
        break
      }
      const [easting, northing] = transformed
        ? transformPoint(vertex.easting, vertex.northing, sourceCrs, projectCrs)
        : [vertex.easting, vertex.northing]
      const projectCheck = validateCoordinateRange(easting, northing, projectCrs)
      if (!projectCheck.valid) {
        errors.push(`Parcel ${parcelNumber}: transformed vertex ${vertexIndex + 1}: ${projectCheck.errors.join('; ')}`)
        invalid = true
        break
      }
      vertices.push({ easting, northing })
    }
    if (invalid) continue

    // A repeated closing vertex is omitted from the point register and restored in WKT.
    const first = vertices[0]
    const last = vertices[vertices.length - 1]
    if (first.easting === last.easting && first.northing === last.northing) vertices.pop()
    if (vertices.length < 3) {
      errors.push(`Parcel ${parcelNumber}: at least three distinct vertices are required`)
      continue
    }

    const area = computeAreaWithPrecision(vertices)
    if (!Number.isFinite(area.areaHectares) || area.areaHectares <= 0) {
      errors.push(`Parcel ${parcelNumber}: polygon has no measurable area`)
      continue
    }
    if (Number.isFinite(input.areaHa) && input.areaHa != null && input.areaHa > 0) {
      const discrepancy = Math.abs(input.areaHa - area.areaHectares)
      if (discrepancy > Math.max(0.0001, area.areaHectares * 0.001)) {
        warnings.push(`Parcel ${parcelNumber}: supplied area differs from coordinate area; coordinate area was stored.`)
      }
    }
    const ring = [...vertices, vertices[0]].map((v) => `${v.easting} ${v.northing}`).join(', ')
    prepared.push({
      parcel_number: parcelNumber,
      lr_number: typeof input.lrNumber === 'string' ? input.lrNumber.trim().slice(0, 50) || null : null,
      owner_name: typeof input.ownerName === 'string' ? input.ownerName.trim().slice(0, 255) || null : null,
      owner_id: typeof input.ownerId === 'string' ? input.ownerId.trim().slice(0, 100) || null : null,
      area_ha: area.areaHectares,
      wkt: `POLYGON((${ring}))`,
      source_vertices: input.vertices.map((v) => ({ easting: v.easting, northing: v.northing })),
      vertices,
    })
  }

  return { parcels: prepared, errors, warnings, transformed }
}
