import {
  buildProjectCadDocument,
  cadCanvasToProject,
  projectToCadCanvas,
} from '@/lib/cad/projectCadDocument'
import { cadDocumentSchema } from '@/lib/cad/cadDocumentValidation'
import { requiredValue } from '@/test-utils/requiredValue'


// Declared reference systems for the synthetic controls in this suite.
const fixtureCrs21037 = 'EPSG:21037'


describe('project CAD document preparation', () => {
  test('preserves imported coordinates through padded canvas placement and round-trip', () => {
    const built = buildProjectCadDocument(
      { projectName: 'Drainage survey', lrNumber: null, surveyorName: null, surveyorLicense: null, projectCrs: fixtureCrs21037, date: '2026-10-07' },
      [
        { pointName: 'MH-01', adjustedEasting: 500_000, adjustedNorthing: 9_800_000 },
        { pointName: 'MH-02', adjustedEasting: 500_100, adjustedNorthing: 9_800_000 },
      ],
    )

    expect(built.document.beacons.map(({ easting, northing }) => [easting, northing])).toEqual([
      [500_000, 9_800_000],
      [500_100, 9_800_000],
    ])
    expect(built.document.boundaries).toEqual([])
    expect(built.document.originEasting).toBeLessThan(500_000)
    expect(built.document.originNorthing).toBeLessThan(9_800_000)

    const first = built.document.beacons[0]
    const canvas = projectToCadCanvas(
      requiredValue(first.easting), requiredValue(first.northing), requiredValue(built.document.originEasting), requiredValue(built.document.originNorthing),
      built.document.height, requiredValue(built.document.metersPerPixel),
    )
    expect(canvas.x).toBeCloseTo(first.x, 10)
    expect(canvas.y).toBeCloseTo(first.y, 10)
    expect(cadCanvasToProject(
      first.x, first.y, requiredValue(built.document.originEasting), requiredValue(built.document.originNorthing),
      built.document.height, requiredValue(built.document.metersPerPixel),
    )).toEqual({ easting: first.easting, northing: first.northing })
  })

  test('does not invent coordinates, parcel edges, registry numbers, or surveyor identity', () => {
    const built = buildProjectCadDocument(
      { projectName: 'Unreferenced project', surveyorName: null, surveyorLicense: null },
      [{ pointName: 'BAD', easting: null, northing: undefined }],
    )

    expect(built.document.beacons).toEqual([])
    expect(built.document.boundaries).toEqual([])
    expect(built.document.originEasting).toBeUndefined()
    expect(built.document.originNorthing).toBeUndefined()
    expect(built.document.metersPerPixel).toBeUndefined()
    expect(built.document.titleBlock).toMatchObject({ lrNumber: '', surveyor: '', regNo: '', scale: 'Uncalibrated' })
    expect(built.omittedStationCount).toBe(1)
  })

  test('does not turn point order into parcel topology', () => {
    const built = buildProjectCadDocument({ projectCrs: fixtureCrs21037 }, [
      { pointName: 'CP-01', easting: 500_000, northing: 9_800_000 },
      { pointName: 'CP-02', easting: 500_020, northing: 9_800_020 },
      { pointName: 'CP-03', easting: 500_040, northing: 9_800_000 },
    ])
    expect(built.document.boundaries).toHaveLength(0)
  })

  test('rejects CAD boundaries that refer to missing point records', () => {
    const built = buildProjectCadDocument({}, [])
    const invalid = {
      ...built.document,
      boundaries: [{
        id: 'edge-1', fromId: 'missing-a', toId: 'missing-b', bearing: '0°',
        distance: '1.000', type: 'standard',
      }],
    }
    expect(cadDocumentSchema.safeParse(invalid).success).toBe(false)
  })

  test('does not plot metric CAD points when the project CRS is unregistered', () => {
    const built = buildProjectCadDocument({ projectCrs: 'EPSG:99999' }, [
      { pointName: 'P1', easting: 500_000, northing: 9_800_000 },
    ])
    expect(built.document.beacons).toHaveLength(0)
    expect(built.document.metersPerPixel).toBeUndefined()
    expect(built.document.coordinateReferenceSystem).toBeUndefined()
    expect(built.referenceIssue).toMatch(/CRS|registered|unknown/i)
  })

  test.each([false, true, [], [500000], {}, '0x7a120', '500000 metres', Infinity, 1_000_000_001])('does not coerce invalid station coordinates into survey points: %p', value => {
    const built = buildProjectCadDocument({ projectCrs: fixtureCrs21037 }, [{ pointName: 'BAD', easting: value, northing: 9800000 }])
    expect(built.document.beacons).toEqual([])
    expect(built.omittedStationCount).toBe(1)
  })

  test('preserves zero and complete decimal strings while choosing one complete coordinate pair', () => {
    const built = buildProjectCadDocument({ projectCrs: fixtureCrs21037 }, [
      { pointName: 'ZERO', easting: '5e5', northing: '0' },
      { pointName: 'ADJUSTED', adjustedEasting: '500010.125', adjustedNorthing: '9800010.375', easting: 500000, northing: 9800000 },
    ])
    expect(built.document.beacons.map(point => [point.easting, point.northing])).toEqual([[500000, 0], [500010.125, 9800010.375]])
  })

  test('does not mix a partial or invalid adjusted coordinate with raw coordinates', () => {
    const built = buildProjectCadDocument({ projectCrs: fixtureCrs21037 }, [
      { pointName: 'PARTIAL', adjustedEasting: 500010, easting: 500000, northing: 9800000 },
      { pointName: 'INVALID', adjustedEasting: false, adjustedNorthing: 9800010, easting: 500000, northing: 9800000 },
      { pointName: 'RAW', adjustedEasting: null, adjustedNorthing: '', easting: 500000, northing: 9800000 },
    ])
    expect(built.document.beacons.map(point => point.label)).toEqual(['RAW'])
    expect(built.omittedStationCount).toBe(2)
  })
})
