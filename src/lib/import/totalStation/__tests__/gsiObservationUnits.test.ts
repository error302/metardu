import { parseGSI } from '../parseGSI'
import { adaptGSI } from '../adapters/gsiAdapter'

test('the literal unprefixed Leica GSI16 example retains its declared word width', () => {
  const result = parseGSI('110001+000000000PNC0055 21.002+0000000013384650 22.002+0000000005371500')
  expect(result.format).toBe('GSI-16')
  expect(result.records[0].pointId).toBe('PNC0055')
  expect(result.records[0].horizontalAngle).toBeCloseTo(120.46185, 9)
  expect(result.records[0].verticalAngle).toBeCloseTo(48.3435, 9)
})

test.each(['  ', '\t'])('word separators %j cannot shift the measurement fields', separator => {
  const result = parseGSI(['110001+00000001', '21..03+09000000', '31..00+00010000'].join(separator))
  expect(result.records[0]).toMatchObject({ pointId: '1', horizontalAngle: 90, slopeDistance: 10 })
})

test.each([
  ['31', 'slopeDistance'], ['32', 'horizontalDistance'], ['33', 'heightDifference'],
  ['81', 'easting'], ['83', 'elevation'], ['87', 'reflectorHeight'], ['88', 'instrumentHeight'],
] as const)('linear word %s cannot silently round an unsafe 16-digit integer', (wi, field) => {
  const result = parseGSI(`*110001+0000000000000001 ${wi}..00+9007199254740993`)
  expect(result.records[0][field]).toBeUndefined()
  expect(result.warnings.join(' ')).toMatch(/safe|invalid|precision/i)
})

test.each([['32', 'horizontalDistance'], ['33', 'heightDifference']] as const)(
  'a supplied linear-only WI %s remains an original observation', (wi, field) => {
    const source = `110001+00000001 ${wi}..06+00012345`
    const result = adaptGSI(source)
    expect(result.observations).toHaveLength(1)
    expect(result.observations[0][field]).toBeCloseTo(1.2345, 12)
    expect(result.observations[0].stationId).toBe('')
    expect(result.meanedObservations).toEqual([])
    expect(parseGSI(source).statistics.observationRecords).toBe(1)
  },
)

// Literal unit encodings from Leica's GSI word contract; expectations are in
// decimal degrees/metres, independently calculated rather than round-tripped.
test('the published Autodesk gon example is normalized to decimal degrees', () => {
  const result = parseGSI('110002+00130021 21.102+19723700 22.102+10000000 31..00+00045179')
  expect(result.records[0].horizontalAngle).toBeCloseTo(177.5133, 9)
  expect(result.records[0].verticalAngle).toBe(90)
  expect(result.records[0].slopeDistance).toBeCloseTo(45.179, 9)
})

test.each([
  ['2', '10000000', 90], ['3', '09000000', 90], ['4', '09000000', 90],
  ['4', '12330450', 123.5125],
])('angular flag %s and payload %s use the declared angular encoding', (unit, payload, expected) => {
  const result = parseGSI(`110001+00000001 21..0${unit}+${payload}`)
  expect(result.records[0].horizontalAngle).toBeCloseTo(expected, 9)
})

test.each([
  ['31', 'slopeDistance'], ['32', 'horizontalDistance'], ['33', 'heightDifference'],
  ['87', 'reflectorHeight'], ['88', 'instrumentHeight'],
] as const)('linear word %s respects submillimetre units', (wi, field) => {
  const result = parseGSI(`110001+00000001 ${wi}..06+00012345`)
  expect(result.records[0][field]).toBeCloseTo(1.2345, 12)
})

test.each(['31', '87', '88'] as const)('linear word %s does not interpret feet as millimetres', wi => {
  const text = `110001+00000001 ${wi}..01+00001000`
  const fields = { '31': 'slopeDistance', '87': 'reflectorHeight', '88': 'instrumentHeight' } as const
  expect(parseGSI(text).records[0][fields[wi]]).toBeUndefined()
  expect(parseGSI(text, { foot: 'international' }).records[0]).toHaveProperty(fields[wi], 0.3048)
})

test.each(['21..04+09060600', '21..04+09000600', '21..09+09000000', '21..03+0900000x'])(
  'invalid angle word %s cannot produce a numeric-prefix measurement', word => {
    const result = parseGSI(`110001+00000001 ${word}`)
    expect(result.records[0].horizontalAngle).toBeUndefined()
    expect(result.warnings.length).toBeGreaterThan(0)
  },
)

test('face inference uses normalized degrees rather than a gon threshold', () => {
  const result = parseGSI('110001+00000001 22..03+19000000')
  expect(result.records[0].verticalAngle).toBe(190)
  expect(result.records[0].facePosition).toBe('FR')
})

test('coordinate order cannot invent an instrument setup or automatic face reduction', () => {
  const result = adaptGSI('110001+00000001 81..00+00010000 82..00+00020000\n110001+00000002 21..03+09000000 22..03+09000000 31..00+00010000')
  expect(result.rawPoints).toHaveLength(1)
  expect(result.observations).toHaveLength(1)
  expect(result.stationName).toBe('')
  expect(result.stationCoords).toBeUndefined()
  expect(result.observations[0].stationId).toBe('')
  expect(result.meanedObservations).toEqual([])
  expect(result.warnings.join(' ')).toMatch(/setup|station/i)
})
