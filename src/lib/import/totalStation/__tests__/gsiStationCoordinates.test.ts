import { parseGSI } from '../parseGSI'
import { adaptGSI } from '../adapters/gsiAdapter'

// Leica GSI ONLINE: WI 81-83 are target coordinates; WI 84-86 are station
// coordinates. Word order cannot change the meaning of either coordinate set.
const target = '81..00+00500000 82..00+01000000 83..00+00000000'
const station = '84..00+00200000 85..00+00300000 86..00-00001000'

test.each([`${target} ${station}`, `${station} ${target}`])(
  'station words cannot overwrite target coordinates: %s', words => {
    const record = parseGSI(`110001+00000001 ${words}`).records[0]
    expect(record).toMatchObject({
      easting: 500, northing: 1000, elevation: 0,
      stationEasting: 200, stationNorthing: 300, stationElevation: -1,
    })
  },
)

test('a station-only record cannot become a target point or guessed setup', () => {
  const result = adaptGSI(`110001+00000001 ${station}`)
  expect(result.rawPoints).toEqual([])
  expect(result.stationName).toBe('')
  expect(result.stationCoords).toBeUndefined()
  expect(result.warnings.join(' ')).toMatch(/station coordinate.*setup/i)
})

test('mixed coordinate records import only their target position', () => {
  const result = adaptGSI(`110001+00000001 ${target} ${station}`)
  expect(result.rawPoints).toEqual([{ id: '1', easting: 500, northing: 1000, elevation: 0, code: '' }])
  expect(result.stationCoords).toBeUndefined()
})

test('invalid station units remain unknown without contaminating valid target coordinates', () => {
  const result = parseGSI(`110001+00000001 ${target} 84..09+00200000`)
  expect(result.records[0]).toMatchObject({ easting: 500, northing: 1000, elevation: 0 })
  expect(result.records[0]).not.toHaveProperty('stationEasting', expect.any(Number))
  expect(result.warnings.join(' ')).toMatch(/unit/i)
})
