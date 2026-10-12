import { prepareParcelBatchImport } from '../prepareBatchImport'

const projectedParcel = {
  parcelNumber: 'P-001',
  areaHa: 1,
  vertices: [
    { easting: 500000, northing: 9800000 },
    { easting: 500100, northing: 9800000 },
    { easting: 500100, northing: 9800100 },
    { easting: 500000, northing: 9800100 },
  ],
}
const projectZone36 = 'EPSG:32736'
const projectZone37 = 'EPSG:32737'
const geographicSource = 'EPSG:4326'

describe('parcel batch import integrity', () => {
  it('requires an explicit source CRS and keeps geometry in the declared project zone', () => {
    expect(() => prepareParcelBatchImport({
      parcels: [projectedParcel], sourceCrs: null,
      projectCrs: projectZone36, confirmTransformation: false,
    })).toThrow(/source EPSG/i)

    const result = prepareParcelBatchImport({
      parcels: [projectedParcel], sourceCrs: projectZone36,
      projectCrs: projectZone36, confirmTransformation: false,
    })
    expect(result.errors).toEqual([])
    expect(result.parcels).toHaveLength(1)
    expect(result.parcels[0].area_ha).toBeCloseTo(1, 6)
    expect(result.parcels[0].wkt).toContain('500000 9800000')
    expect(result.parcels[0].source_vertices).toEqual(projectedParcel.vertices)
  })

  it('requires confirmation before transforming RFC 7946 longitude/latitude into project metres', () => {
    const geographicParcel = {
      parcelNumber: 'P-002',
      vertices: [
        { easting: 36.8, northing: -1.3 },
        { easting: 36.801, northing: -1.3 },
        { easting: 36.801, northing: -1.299 },
        { easting: 36.8, northing: -1.299 },
      ],
    }
    expect(() => prepareParcelBatchImport({
      parcels: [geographicParcel], sourceCrs: geographicSource,
      projectCrs: projectZone37, confirmTransformation: false,
    })).toThrow(/Confirm the coordinate transformation/i)

    const result = prepareParcelBatchImport({
      parcels: [geographicParcel], sourceCrs: geographicSource,
      projectCrs: projectZone37, confirmTransformation: true,
    })
    expect(result.transformed).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.parcels[0].source_vertices).toEqual(geographicParcel.vertices)
    expect(result.parcels[0].vertices[0].easting).toBeGreaterThan(1000)
    expect(result.parcels[0].vertices[0].northing).toBeGreaterThan(9000000)
  })

  it('rejects display CRS, duplicate names and invalid coordinates without storing their geometry', () => {
    expect(() => prepareParcelBatchImport({
      parcels: [projectedParcel], sourceCrs: 'EPSG:3857',
      projectCrs: projectZone36, confirmTransformation: true,
    })).toThrow(/display-only/i)

    const result = prepareParcelBatchImport({
      parcels: [projectedParcel, { ...projectedParcel, parcelNumber: 'p-001' }, {
        ...projectedParcel,
        parcelNumber: 'P-003',
        vertices: [{ easting: Number.NaN, northing: 9800000 }, ...projectedParcel.vertices.slice(1)],
      }],
      sourceCrs: projectZone36, projectCrs: projectZone36, confirmTransformation: false,
    })
    expect(result.parcels).toHaveLength(1)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/repeated in this batch/),
      expect.stringMatching(/invalid coordinates/),
    ]))
  })
})
