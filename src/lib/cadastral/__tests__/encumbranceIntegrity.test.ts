import { analyzeEncumbrances, parseEncumbranceCoordinates, type Encumbrance } from '../encumbranceAnalysis'
const fixtureCrs = 'EPSG:32737'
const boundary = [{ easting: 500000, northing: 9799950 }, { easting: 500100, northing: 9799950 }, { easting: 500100, northing: 9800050 }, { easting: 500000, northing: 9800050 }]
const corridor = (id: string): Encumbrance => ({ id, type: 'wayleave', description: 'Supplied design corridor', holder: 'Source holder', registeredDate: '',
  corridorWidth: 10, geometryType: 'centreline', coordinates: [{ easting: 499950, northing: 9800000 }, { easting: 500150, northing: 9800000 }] })
const context = { boundary, crsCode: fixtureCrs, corridorModel: 'butt-bevel' as const }

it('keeps area coverage and registry status unknown without parcel geometry', () => {
  const result = analyzeEncumbrances([], 10000)
  expect(result.totalAffectedArea).toBeNull()
  expect(result.affectedPercent).toBeNull()
  expect(result.summary).not.toMatch(/No encumbrances registered/)
})
it('clips corridor coverage at the parcel and counts duplicate overlapping footprints once', () => {
  const result = analyzeEncumbrances([corridor('a'), corridor('b')], 10000, context)
  expect(result.totalAffectedArea).toBeCloseTo(1000, 7)
  expect(result.affectedPercent).toBeCloseTo(10, 7)
  expect(result.registryStatus).toBe('not-verified')
})
it('unions crossing corridors without double-counting their intersection', () => {
  const cross = { ...corridor('cross'), coordinates: [{ easting: 500050, northing: 9799900 }, { easting: 500050, northing: 9800100 }] }
  expect(analyzeEncumbrances([corridor('a'), cross], undefined, context).totalAffectedArea).toBeCloseTo(1900, 7)
})
it('rejects malformed coordinates, zero width, duplicate identities and undeclared CRS', () => {
  expect(() => analyzeEncumbrances([{ ...corridor('a'), coordinates: [{ easting: NaN, northing: 0 }, { easting: 500000, northing: 0 }] }], undefined, context)).toThrow()
  expect(() => analyzeEncumbrances([{ ...corridor('a'), corridorWidth: 0 }], undefined, context)).toThrow()
  expect(() => analyzeEncumbrances([corridor('a'), corridor('a')], undefined, context)).toThrow()
  expect(() => analyzeEncumbrances([corridor('a')], undefined, { ...context, crsCode: '' })).toThrow()
})
it('subtracts parcel holes and supports authoritative polygon footprints', () => {
  const hole = [{ easting: 500040, northing: 9799995 }, { easting: 500060, northing: 9799995 }, { easting: 500060, northing: 9800005 }, { easting: 500040, northing: 9800005 }]
  const result = analyzeEncumbrances([corridor('a')], undefined, { ...context, holes: [hole] })
  expect(result.parcelArea).toBeCloseTo(9800, 7)
  expect(result.totalAffectedArea).toBeCloseTo(800, 7)
  const footprint = { ...corridor('polygon'), geometryType: 'polygon' as const, corridorWidth: undefined, coordinates: hole }
  expect(analyzeEncumbrances([footprint], undefined, { ...context, corridorModel: undefined }).totalAffectedArea).toBeCloseTo(200, 7)
})
it('keeps unmapped records in a partial assessment and does not substitute zero coverage', () => {
  const result = analyzeEncumbrances([corridor('a'), { ...corridor('unmapped'), coordinates: [], corridorWidth: undefined, geometryType: undefined }], undefined, context)
  expect(result.coverageStatus).toBe('partial')
  expect(result.assessedUnionArea).toBeCloseTo(1000, 7)
  expect(result.totalAffectedArea).toBeNull()
  expect(result.affectedPercent).toBeNull()
  expect(result.records[1].withinParcelArea).toBeNull()
})
it('requires an explicit corridor model and records an actual supplied source area difference', () => {
  expect(() => analyzeEncumbrances([corridor('a')], undefined, { ...context, corridorModel: undefined })).toThrow(/model/i)
  expect(analyzeEncumbrances([corridor('a')], 10010, context).declaredAreaDifference).toBeCloseTo(10, 7)
})
it('models butt ends and bevel joins at bends instead of using length times width', () => {
  const points = [{ easting: 500010, northing: 9800000 }, { easting: 500020, northing: 9800000 }, { easting: 500020, northing: 9800010 }]
  expect(analyzeEncumbrances([{ ...corridor('bend'), corridorWidth: 4, coordinates: points }], undefined, context).totalAffectedArea).toBeCloseTo(78, 7)
})
it('rejects invalid holes and accepts exact finite zero coordinates without converting missing values', () => {
  expect(() => analyzeEncumbrances([corridor('a')], undefined, { ...context, holes: [[...boundary]] })).toThrow(/hole/i)
  expect(parseEncumbranceCoordinates('0,0\r\n1,-1')).toEqual([[{ easting: 0, northing: 0 }, { easting: 1, northing: -1 }]])
  expect(() => parseEncumbranceCoordinates('500000,\n500100,9800000')).toThrow(/row 1/i)
  expect(() => parseEncumbranceCoordinates('500000,9800000m')).toThrow()
})
it('clips concave parcels into separate regions without inventing a bridge across the excluded area', () => {
  const concave = [{ easting: 500000, northing: 9799950 }, { easting: 500100, northing: 9799950 }, { easting: 500100, northing: 9800050 },
    { easting: 500070, northing: 9800050 }, { easting: 500070, northing: 9799970 }, { easting: 500030, northing: 9799970 },
    { easting: 500030, northing: 9800050 }, { easting: 500000, northing: 9800050 }]
  const result = analyzeEncumbrances([corridor('a')], undefined, { ...context, boundary: concave })
  expect(result.parcelArea).toBeCloseTo(6800, 7)
  expect(result.totalAffectedArea).toBeCloseTo(600, 7)
  expect(result.unionGeometry?.type).toBe('MultiPolygon')
})
it('reports a measured outside footprint as zero coverage while preserving unknown/unmapped records', () => {
  const result = analyzeEncumbrances([{ ...corridor('outside'), coordinates: [{ easting: 500200, northing: 9800000 }, { easting: 500300, northing: 9800000 }] }], undefined, context)
  expect(result.totalAffectedArea).toBe(0)
  expect(result.affectedPercent).toBe(0)
  expect(result.coverageStatus).toBe('complete-for-supplied-geometry')
  expect(result.unionGeometry).toBeNull()
})
it('rejects display/geographic frames, partial geometry and work that exceeds the vertex limit', () => {
  for (const unsupportedCrs of ['EPSG:3857', 'EPSG:4326']) expect(() => analyzeEncumbrances([corridor('a')], undefined, { ...context, crsCode: unsupportedCrs })).toThrow()
  expect(() => analyzeEncumbrances([{ ...corridor('a'), coordinates: [corridor('a').coordinates[0]] }], undefined, context)).toThrow(/partial|complete/i)
  expect(() => analyzeEncumbrances([corridor('a'), corridor(' a ')], undefined, context)).toThrow(/unique/i)
  expect(() => analyzeEncumbrances([{ ...corridor('a'), coordinates: Array.from({ length: 5001 }, () => ({ easting: 500000, northing: 9800000 })) }], undefined, context)).toThrow(/vertices/i)
})
