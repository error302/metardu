/** @jest-environment node */
import { parseCadastralBearing, prepareCadastralInput } from '@/lib/survey/cadastralInput'
import { fieldToFinish } from '@/lib/survey/field-to-finish'

const project = { boundary_data: { startControl: { name: 'A', easting: 500000, northing: 9900000 } } }
const legs: Array<[string, string, number, number]> = [
  ['A', 'B', 0, 80], ['B', 'C', 90, 100], ['C', 'D', 180, 80], ['D', 'A', 270, 100],
]
const entries = legs.map(([station, target, bearing, distance]) => ({
  station, raw_data: { target, bearing, distance, distanceType: 'grid' },
}))

test.each([true, false, [], [500000], {}, '0x20', 'Infinity'].map(easting => ({ easting })))('control coordinate $easting cannot become a survey number through coercion', ({ easting }) => {
  expect(() => prepareCadastralInput({ boundary_data: { startControl: { name: 'A', easting, northing: 9900000 } } }, entries, [])).toThrow(/finite.*easting|coordinate/i)
})

test.each([true, [80], '0x50'].map(distance => ({ distance })))('distance $distance cannot become a measured leg through coercion', ({ distance }) => {
  const changed = [{ ...entries[0], raw_data: { ...entries[0].raw_data, distance } }, ...entries.slice(1)]
  expect(() => prepareCadastralInput(project, changed, [])).toThrow(/positive finite distance/i)
})

test('arrays cannot become station names or bearings', () => {
  expect(() => prepareCadastralInput(project, [{ ...entries[0], station: ['A'] }, ...entries.slice(1)], [])).toThrow(/station/i)
  expect(() => parseCadastralBearing([90])).toThrow(/bearing/i)
})

test.each([null, [], 4, 'corrupt'].map(observation => ({ observation })))('malformed observation $observation produces a field-book error', ({ observation }) => {
  expect(() => prepareCadastralInput(project, [observation, ...entries.slice(1)], [])).toThrow(/observation.*object/i)
})

test.each([[], 'corrupt', 9].map(raw_data => ({ raw_data })))('malformed raw data $raw_data is rejected explicitly', ({ raw_data }) => {
  expect(() => prepareCadastralInput(project, [{ ...entries[0], raw_data }, ...entries.slice(1)], [])).toThrow(/raw data.*object/i)
})

test('decimal numeric text preserves exact zero control and grid readings without adding corrections', async () => {
  const textProject = { boundary_data: { startControl: { name: 'A', easting: '0', northing: '-100.5' } }, utm_zone: null }
  const textRows = entries.map(entry => ({ ...entry, raw_data: { ...entry.raw_data, distance: String(entry.raw_data.distance), bearing: String(entry.raw_data.bearing) } }))
  const input = prepareCadastralInput(textProject, textRows, [])
  expect(input.startStation).toEqual({ name: 'A', easting: 0, northing: -100.5 })
  expect(input.utmZone).toBeUndefined()
  const result = await fieldToFinish(input)
  expect(result.area.squareMetres).toBeCloseTo(8000, 8)
  expect(result.corrections).toEqual([])
})

test('project metadata is retained as declared text without manufacturing unknown values', () => {
  const input = prepareCadastralInput({ ...project, parcel_number: ' LR 12/34 ', surveyor_name: ' Surveyor ', surveyor_license: ' LS 1 ', utm_zone: 37 }, entries, [])
  expect(input).toMatchObject({ lrNumber: 'LR 12/34', surveyorName: 'Surveyor', surveyorLicense: 'LS 1', utmZone: 37 })
  expect(() => prepareCadastralInput({ ...project, surveyor_license: { unverified: true } }, entries, [])).toThrow(/licen[cs]e.*text/i)
})

test.each([true, [37], 0, 61, 37.5].map(utm_zone => ({ utm_zone })))('invalid optional UTM metadata $utm_zone is not admitted', ({ utm_zone }) => {
  expect(() => prepareCadastralInput({ ...project, utm_zone }, entries, [])).toThrow(/UTM zone/i)
})
