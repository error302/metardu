import {
  admittedSchemeSource,
  buildSchemeArtifact,
  hashSchemeValue,
  schemeSourceRevision,
} from '@/lib/scheme/exportArtifact'
import { schemeExportRequestSchema } from '@/lib/scheme/exportContract'
import { schemeViewport } from './fixtures/schemeView'
const sourceCrs = 'EPSG:32737'
function selected() {
  const view = schemeViewport()
  return {
    ...view,
    bbox: null,
    selection: view.features.map((feature) =>
      'id' in feature ? feature.id : '',
    ),
  }
}
it('requires an exact unchanged reviewed selection rather than a viewport', () => {
  expect(() => admittedSchemeSource(schemeViewport())).toThrow()
  const source = selected()
  expect(admittedSchemeSource(source).crs).toBe(sourceCrs)
  expect(() =>
    admittedSchemeSource({
      ...source,
      selection: ['66666666-6666-4666-8666-666666666666'],
    }),
  ).toThrow(/exact selected/)
  const stale = selected()
  const feature = stale.features[0]
  if (feature.properties.kind !== 'parcel')
    throw new Error('Expected a parcel fixture.')
  feature.properties.evidenceState = 'changed_since_review'
  feature.properties.canSnap = false
  expect(() => admittedSchemeSource(stale)).toThrow(/unchanged reviewed/)
})
it('preserves exact grid rings in the source manifest and emits only 2D closed DXF polylines', () => {
  const source = selected(),
    result = buildSchemeArtifact(source, 'dxf'),
    text = result.bytes.toString()
  expect(result.manifest.source).toEqual(source)
  expect(result.outputCrs).toBe(sourceCrs)
  expect(text).toContain('LWPOLYLINE')
  expect(text).not.toMatch(/\nPOINT\n|\nPOLYLINE\n|\nVERTEX\n/)
  expect(text).toContain('NO OBSERVED HEIGHTS')
  expect(text).toContain('9500020')
  expect(Object.values(result.manifest.layers)).toEqual([
    { parcelId: source.selection[0], ring: 0, role: 'outer' },
  ])
  expect(result.sourceRevision).toHaveLength(50)
  expect(schemeSourceRevision(hashSchemeValue(source))).toBe(
    result.sourceRevision,
  )
})
it('emits geographic GeoJSON without a projected CRS override or invented height', () => {
  const source = selected(),
    result = buildSchemeArtifact(source, 'geojson'),
    json = JSON.parse(result.bytes.toString()) as {
      crs?: unknown
      features: Array<{ geometry: { coordinates: number[][][] } }>
    }
  expect(json).not.toHaveProperty('crs')
  expect(json.features[0].geometry.coordinates[0][0][0]).toBeCloseTo(39, 8)
  expect(json.features[0].geometry.coordinates[0][0][1]).toBeLessThan(0)
  expect(
    json.features[0].geometry.coordinates
      .flat()
      .every((point) => point.length === 2),
  ).toBe(true)
  expect(result.manifest.source).toEqual(source)
  expect(result.manifest.transformation).toMatchObject({
    engine: 'proj4',
    dimensions: 2,
    verticalTransformation: false,
    independentlyVerified: false,
  })
})
it('rejects missing review confirmation and duplicate parcel identifiers', () => {
  const view = selected(),
    body = {
      projectId: view.projectId,
      expectedUserId: '11111111-1111-4111-8111-111111111111',
      requestId: '22222222-2222-4222-8222-222222222222',
      parcelIds: view.selection,
      sourceHash: hashSchemeValue(view),
      reviewed: true,
    }
  expect(schemeExportRequestSchema.safeParse(body).success).toBe(true)
  expect(
    schemeExportRequestSchema.safeParse({ ...body, reviewed: false }).success,
  ).toBe(false)
  expect(
    schemeExportRequestSchema.safeParse({
      ...body,
      parcelIds: [...body.parcelIds, ...body.parcelIds],
    }).success,
  ).toBe(false)
})
