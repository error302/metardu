import Papa from 'papaparse'
import { analyzeEncumbrances, type Encumbrance } from '../encumbranceAnalysis'
import { buildEncumbranceCsv, buildEncumbranceGeometryCsv, generateEncumbranceDxf } from '../encumbranceExports'
import { parseDXFFileContent } from '@/lib/parsers/parseDXF'

const fixtureCrs = 'EPSG:32737'
const parcel = { crsCode: fixtureCrs, corridorModel: 'butt-bevel' as const,
  boundary: [{ easting: 500000, northing: 9799950 }, { easting: 500100, northing: 9799950 }, { easting: 500100, northing: 9800050 }, { easting: 500000, northing: 9800050 }] }
const records: Encumbrance[] = [{ id: 'a', type: 'wayleave', description: '=formula', holder: 'Source', geometryType: 'centreline', corridorWidth: 10,
  coordinates: [{ easting: 499950, northing: 9800000 }, { easting: 500150, northing: 9800000 }] }]

it('round-trips real metre geometry through the existing native DXF parser without changing its origin', async () => {
  const result = analyzeEncumbrances(records, undefined, parcel)
  const dxf = generateEncumbranceDxf(result, parcel)
  const parsed = await parseDXFFileContent(dxf, 'coverage.dxf')
  expect(parsed.errors).toEqual([])
  expect(parsed.cad?.units).toBe('meters')
  const union = parsed.cad?.entities.find(entity => entity.layer === 'COVERAGE_UNION')
  expect(union).toMatchObject({ kind: 'LWPOLYLINE', closed: true })
  expect(union?.coordinates).toHaveLength(4)
  expect(union?.coordinates.map(p => p.easting).sort()).toEqual([500000, 500000, 500100, 500100])
  expect(union?.coordinates.map(p => p.northing).sort()).toEqual([9799995, 9799995, 9800005, 9800005])
  expect(dxf).toContain('DRAFT - REGISTRY STATUS NOT VERIFIED')
  expect(dxf).toContain('NO SURVEYED ELEVATION OR VERTICAL DATUM')
  expect(dxf).toContain(fixtureCrs)
})
it('exports all records, unknown source dates, safe text and exact coordinate geometry', () => {
  const result = analyzeEncumbrances(records, undefined, parcel)
  const schedule = Papa.parse<Record<string, string>>(buildEncumbranceCsv(result, parcel), { header: true }).data
  expect(schedule).toHaveLength(1)
  expect(schedule[0].Source_registration_date).toBe('')
  expect(schedule[0].Description).toBe("'=formula")
  expect(schedule[0].Within_parcel_area_m2).toBe('1000')
  const geometry = Papa.parse<Record<string, string>>(buildEncumbranceGeometryCsv(result, parcel), { header: true }).data
  expect(geometry.some(row => row.Geometry_role === 'SUPPLIED_CENTRELINE' && row.Easting_m === '499950')).toBe(true)
  expect(geometry.filter(row => row.Geometry_role === 'CLIPPED_UNION')).toHaveLength(5)
})
it('rejects stale exported quantities and retains unmapped records in the schedule', () => {
  const result = analyzeEncumbrances(records, undefined, parcel)
  expect(() => generateEncumbranceDxf({ ...result, totalAffectedArea: 9999 }, parcel)).toThrow(/stale/i)
  const unknown = analyzeEncumbrances([{ ...records[0], coordinates: [], geometryType: undefined, corridorWidth: undefined }])
  expect(buildEncumbranceCsv(unknown)).toContain('No spatial footprint')
  expect(() => generateEncumbranceDxf(unknown)).toThrow(/parcel|coverage/i)
})
