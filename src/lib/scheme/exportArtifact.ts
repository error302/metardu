import { createHash } from 'node:crypto'
import Drawing from 'dxf-writer'
import { version as dxfWriterVersion } from 'dxf-writer/package.json'
import { version as proj4Version } from 'proj4/package.json'
import { canonicalJSON } from '@/lib/audit/auditHash'
import { AppError } from '@/lib/api/errors'
import {
  assertProjectedCrs,
  getRegisteredCrsDefinition,
  transformPoint,
  validateCoordinateRange,
  WGS84_CRS,
} from '@/lib/spatial/projectCrs'
import {
  schemeViewportSchema,
  type SchemeViewport,
  type SchemeParcelFeature,
} from './schemeView'
import {
  SCHEME_EXPORT_BYTES,
  schemeExportSourceRevision,
  type SchemeExportFormat,
} from './exportContract'
export const hashSchemeValue = (value: unknown) =>
  createHash('sha256').update(canonicalJSON(value)).digest('hex')
export const schemeSourceRevision = schemeExportSourceRevision
const conflict = (message: string) =>
  new AppError(message, 409, 'SCHEME_EXPORT_SOURCE')
export function admittedSchemeSource(input: unknown): SchemeViewport {
  const source = schemeViewportSchema.parse(input)
  assertProjectedCrs(source.crs)
  if (
    source.mode !== 'polygons' ||
    source.bbox !== null ||
    !source.selection ||
    source.partial ||
    source.history !== 'available' ||
    source.features.length !== source.selection.length ||
    source.features.some(
      (feature) =>
        feature.properties.kind !== 'parcel' ||
        feature.properties.evidenceState !== 'reviewed_draft',
    )
  )
    throw conflict(
      'Select exact unchanged reviewed boundary drafts. Missing, changed or unassessed geometry cannot produce this export.',
    )
  const ids = source.features
    .map((feature) => ('id' in feature ? feature.id : ''))
    .sort()
  if (JSON.stringify(ids) !== JSON.stringify([...source.selection].sort()))
    throw conflict(
      'The stored geometry does not match the exact selected parcel IDs.',
    )
  for (const feature of source.features)
    if (feature.geometry.type === 'Polygon')
      for (const ring of feature.geometry.coordinates)
        for (const [x, y] of ring) {
          const range = validateCoordinateRange(x, y, source.crs)
          if (!range.valid)
            throw conflict(
              'A stored coordinate is incompatible with the declared grid. Review the saved reference and source coordinate range.',
            )
        }
  return source
}
function signedArea(ring: [number, number][]) {
  const [x, y] = ring[0]
  let sum = 0
  for (let i = 1; i < ring.length; i++)
    sum +=
      (ring[i - 1][0] - x) * (ring[i][1] - y) -
      (ring[i][0] - x) * (ring[i - 1][1] - y)
  return sum / 2
}
export function buildSchemeArtifact(
  input: unknown,
  format: SchemeExportFormat,
) {
  const source = admittedSchemeSource(input),
    sourceHash = hashSchemeValue(source),
    sourceRevision = schemeSourceRevision(sourceHash)
  const parcels = source.features.filter(
    (feature): feature is SchemeParcelFeature => 'id' in feature,
  )
  const definition = getRegisteredCrsDefinition(source.crs),
    target = getRegisteredCrsDefinition(WGS84_CRS)
  const transformation =
    format === 'geojson'
      ? {
          engine: 'proj4',
          version: proj4Version,
          source: definition,
          target,
          dimensions: 2,
          verticalTransformation: false,
          independentlyVerified: false,
          usage:
            'Geographic interchange draft; use the retained grid geometry for survey measurements. Registered datum parameters do not establish local transformation accuracy.',
        }
      : null
  const layers: Record<
    string,
    { parcelId: string; ring: number; role: 'outer' | 'hole' }
  > = {}
  let content: string
  if (format === 'geojson') {
    const features = parcels.map((parcel) => {
      const coordinates = parcel.geometry.coordinates.map((ring, index) => {
        const transformed = ring.map(([x, y]) => {
          const p = transformPoint(x, y, source.crs, WGS84_CRS)
          if (
            !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90
          )
            throw conflict(
              'A saved grid coordinate cannot be represented safely in geographic GeoJSON.',
            )
          return p
        })
        for (let i = 1; i < transformed.length; i++)
          if (Math.abs(transformed[i][0] - transformed[i - 1][0]) > 180)
            throw conflict(
              'This boundary crosses the antimeridian and requires explicit splitting before GeoJSON export.',
            )
        const area = signedArea(transformed)
        if (!Number.isFinite(area) || area === 0)
          throw conflict('A boundary collapsed during geographic conversion.')
        return area > 0 === (index === 0)
          ? transformed
          : [...transformed].reverse()
      })
      return {
        type: 'Feature',
        id: parcel.id,
        geometry: { type: 'Polygon', coordinates },
        properties: {
          parcelId: parcel.id,
          parcelNumber: parcel.properties.parcelNumber,
          blockId: parcel.properties.blockId,
          recordedStatus: parcel.properties.recordedStatus,
          sourceRevision: parcel.properties.revision,
          sourceUpdatedAt: parcel.properties.updatedAt,
          boundaryReceiptId: parcel.properties.receiptId,
          geometryHash: parcel.properties.geometryHash,
          gridAreaSqM: parcel.properties.gridAreaSqM,
          sourceCrs: source.crs,
          assessment: 'unverified_draft',
        },
      }
    })
    content =
      JSON.stringify({
        type: 'FeatureCollection',
        features,
        metardu: {
          protocol: 'scheme-boundary-export-v1',
          sourceHash,
          sourceRevision,
          sourceCrs: source.crs,
          outputReference: 'WGS 84 longitude, latitude; decimal degrees',
          dimensions: 2,
          heights: 'not provided',
          transformation,
          professionalApproval: false,
          fieldVerified: false,
        },
      }) + '\n'
  } else {
    const drawing = new Drawing()
    drawing.setUnits('Meters')
    for (const parcel of parcels)
      for (const [i, ring] of parcel.geometry.coordinates.entries()) {
        const layer = `P_${parcel.id.replaceAll('-', '')}_${i === 0 ? 'OUTER' : `HOLE_${i}`}`
        layers[layer] = {
          parcelId: parcel.id,
          ring: i,
          role: i === 0 ? 'outer' : 'hole',
        }
        drawing.addLayer(layer, i === 0 ? 3 : 2, 'CONTINUOUS')
        drawing.setActiveLayer(layer)
        drawing.drawPolyline(ring.slice(0, -1), true)
      }
    content = `999\nMETARDU UNVERIFIED BOUNDARY DRAFT; 2D PROJECT GRID; NO OBSERVED HEIGHTS\n999\nCRS ${source.crs}; UNITS METRES; SOURCE ${sourceHash}\n${drawing.toDxfString()}`
  }
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.length > SCHEME_EXPORT_BYTES)
    throw conflict(
      'This selected output exceeds the 4 MiB artifact window. Export a smaller explicit selection.',
    )
  return {
    bytes,
    sourceHash,
    sourceRevision,
    outputCrs: format === 'dxf' ? source.crs : WGS84_CRS,
    manifest: {
      protocol: 'scheme-boundary-export-v1',
      source,
      sourceHash,
      sourceRevision,
      sourceDefinition: definition,
      encoder:
        format === 'dxf'
          ? { name: 'dxf-writer', version: dxfWriterVersion }
          : {
              name: 'ECMAScript JSON',
              engine: 'Node.js',
              version: process.versions.node,
            },
      outputCrs: format === 'dxf' ? source.crs : WGS84_CRS,
      transformation,
      layers,
      dimensions: 2,
      heights: 'not provided',
      professionalApproval: false,
      fieldVerified: false,
    },
  }
}
