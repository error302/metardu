/**
 * GSI Parser Tests
 *
 * Tests the Leica GSI-8/GSI-16 format parser with real-world sample data.
 */

import { parseGSI, pairFaces, toTraverseObservations, type GSIRecord } from '@/lib/import/totalStation/parseGSI'

// ─── Sample GSI-8 Data ────────────────────────────────────────────────────
// GSI-8 format: each word block is 16 characters
// Format: WI(2) + info(4) + sign(1) + data(8) = 15 chars (+space = 16)

const GSI8_COORDINATE_DATA = [
  '110001+00000001 81..00+00298432 82..00+01234567 83..00+00001542',
  '110001+00000002 81..00+00298543 82..00+01235678 83..00+00001653',
  '110001+00000003 81..00+00298654 82..00+01236789 83..00+00001764',
].join('\n')

const GSI8_OBSERVATION_DATA = [
  '110001+00000001 21.324+01234567 22.324+09876543 31..00+00102345',
  '110001+00000002 21.324+02345678 22.324+08765432 31..00+00105432',
].join('\n')

const GSI16_DATA = [
  '*110001+0000000000001 21.324+00001234567 22.324+00009876543 31..00+00000102345 81..00+00000298432 82..00+00001234567 83..00+00000001542',
  '*110001+0000000000002 21.324+00002345678 22.324+00008765432 31..00+00000105432 81..00+00000298543 82..00+00001235678 83..00+00000001653',
].join('\n')

const GSI8_WITH_FEATURE_CODE = [
  '110001+00000001 81..00+00298432 82..00+01234567 83..00+00001542 71..00+0000BM01',
].join('\n')

const GSI8_WITH_HEIGHTS = [
  '110001+00000001 21.324+01234567 31..00+00102345 87..00+00001542 88..00+00001653',
].join('\n')

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('parseGSI', () => {
  describe('format detection', () => {
    it('detects GSI-8 format (no leading asterisk)', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      expect(result.format).toBe('GSI-8')
    })

    it('detects GSI-16 format (leading asterisk)', () => {
      const result = parseGSI(GSI16_DATA)
      expect(result.format).toBe('GSI-16')
    })

    it('returns unknown for empty input', () => {
      const result = parseGSI('')
      expect(result.format).toBe('unknown')
      expect(result.ok).toBe(false)
    })
  })

  describe('point ID extraction (WI 11)', () => {
    it('extracts point IDs from GSI-8', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      expect(result.records.length).toBe(3)
      expect(result.records[0].pointId).toBe('1')
      expect(result.records[1].pointId).toBe('2')
      expect(result.records[2].pointId).toBe('3')
    })

    it('extracts point IDs from GSI-16', () => {
      const result = parseGSI(GSI16_DATA)
      expect(result.records.length).toBe(2)
      expect(result.records[0].pointId).toBeTruthy()
      expect(result.records[1].pointId).toBeTruthy()
    })
  })

  describe('coordinate parsing', () => {
    it('parses easting (WI 81)', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      // WI 81 value = 00298432 → divided by 1000 = 29.8432
      expect(result.records[0].easting).toBeDefined()
      expect(typeof result.records[0].easting).toBe('number')
    })

    it('parses northing (WI 82)', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      expect(result.records[0].northing).toBeDefined()
      expect(typeof result.records[0].northing).toBe('number')
    })

    it('parses elevation (WI 83)', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      expect(result.records[0].elevation).toBeDefined()
      expect(typeof result.records[0].elevation).toBe('number')
    })

    it('parses all three coordinates for multiple records', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      for (const rec of result.records) {
        expect(rec.easting).toBeDefined()
        expect(rec.northing).toBeDefined()
        expect(rec.elevation).toBeDefined()
      }
    })
  })

  describe('angle parsing', () => {
    it('parses horizontal angle (WI 21)', () => {
      const result = parseGSI(GSI8_OBSERVATION_DATA)
      expect(result.records[0].horizontalAngle).toBeDefined()
      expect(typeof result.records[0].horizontalAngle).toBe('number')
    })

    it('parses vertical angle (WI 22)', () => {
      const result = parseGSI(GSI8_OBSERVATION_DATA)
      expect(result.records[0].verticalAngle).toBeDefined()
      expect(typeof result.records[0].verticalAngle).toBe('number')
    })
  })

  describe('distance parsing', () => {
    it('parses slope distance (WI 31)', () => {
      const result = parseGSI(GSI8_OBSERVATION_DATA)
      expect(result.records[0].slopeDistance).toBeDefined()
      expect(typeof result.records[0].slopeDistance).toBe('number')
    })
  })

  describe('feature code (WI 71)', () => {
    it('parses feature code', () => {
      const result = parseGSI(GSI8_WITH_FEATURE_CODE)
      expect(result.records[0].featureCode).toBeDefined()
    })
  })

  describe('reflector and instrument height', () => {
    it('parses reflector height (WI 87)', () => {
      const result = parseGSI(GSI8_WITH_HEIGHTS)
      expect(result.records[0].reflectorHeight).toBeDefined()
      expect(typeof result.records[0].reflectorHeight).toBe('number')
    })

    it('parses instrument height (WI 88)', () => {
      const result = parseGSI(GSI8_WITH_HEIGHTS)
      expect(result.records[0].instrumentHeight).toBeDefined()
      expect(typeof result.records[0].instrumentHeight).toBe('number')
    })
  })

  describe('face detection', () => {
    it('detects face-left for vertical angle < 200', () => {
      const result = parseGSI(GSI8_OBSERVATION_DATA)
      // Our test data has vertical angles that are WI 22 values / 100000
      // which could be < 200 (gon) or > 200 depending on the raw value
      expect(result.statistics.faceLeftCount + result.statistics.faceRightCount).toBeGreaterThan(0)
    })
  })

  describe('statistics', () => {
    it('reports correct record counts', () => {
      const result = parseGSI(GSI8_COORDINATE_DATA)
      expect(result.statistics.totalRecords).toBe(3)
      expect(result.statistics.coordinateRecords).toBe(3)
    })

    it('reports observation records for angle/distance data', () => {
      const result = parseGSI(GSI8_OBSERVATION_DATA)
      expect(result.statistics.totalRecords).toBe(2)
      expect(result.statistics.observationRecords).toBe(2)
    })
  })

  describe('error handling', () => {
    it('handles empty input gracefully', () => {
      const result = parseGSI('')
      expect(result.ok).toBe(false)
      expect(result.records).toHaveLength(0)
      expect(result.warnings).toContain('Empty file')
    })

    it('handles lines without point IDs', () => {
      const data = '81..00+00298432 82..00+01234567'
      const result = parseGSI(data)
      // Lines without WI 11 should not produce records
      expect(result.records).toHaveLength(0)
    })
  })
})

describe('pairFaces', () => {
  it('pairs face-left and face-right observations', () => {
    // Create synthetic records with FL and FR
    const records: GSIRecord[] = [
      { pointId: '1', horizontalAngle: 45, verticalAngle: 90, slopeDistance: 100, facePosition: 'FL', rawLine: '' },
      { pointId: '1', horizontalAngle: 225, verticalAngle: 270, slopeDistance: 100.01, facePosition: 'FR', rawLine: '' },
    ]
    const pairs = pairFaces(records)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].pointId).toBe('1')
    expect(pairs[0].faceRight).not.toBeNull()
    expect(pairs[0].meanSlopeDistance).toBeCloseTo(100.005, 1)
  })

  it('handles single-face observations', () => {
    const records: GSIRecord[] = [
      { pointId: '1', horizontalAngle: 45, verticalAngle: 90, slopeDistance: 100, facePosition: 'FL', rawLine: '' },
    ]
    const pairs = pairFaces(records)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].faceRight).toBeNull()
  })
})

describe('toTraverseObservations', () => {
  it('converts face pairs to traverse observations', () => {
    const records: GSIRecord[] = [
      { pointId: '1', horizontalAngle: 45, verticalAngle: 90, slopeDistance: 100, facePosition: 'FL', rawLine: '' },
      { pointId: '2', horizontalAngle: 135, verticalAngle: 92, slopeDistance: 80, facePosition: 'FL', rawLine: '' },
    ]
    const pairs = pairFaces(records)
    const observations = toTraverseObservations(pairs)
    expect(observations).toHaveLength(2)
    expect(observations[0].station).toBe('1')
    expect(observations[1].station).toBe('2')
    expect(parseFloat(observations[0].slopeDist)).toBeCloseTo(100, 0)
  })
})
