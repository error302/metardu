import { finiteSurveyCoordinate, requireDeclaredProjectCrs } from '../ol/pointLoading'

describe('project point CRS resolution', () => {
  it('uses the declared horizontal CRS verbatim', () => {
    expect(requireDeclaredProjectCrs({ horizontal_crs: ' EPSG:21036 ' })).toBe('EPSG:21036')
  })

  it.each([undefined, null, { horizontal_crs: null }, { horizontal_crs: '' }, { horizontal_crs: '   ' }])(
    'fails closed when no project CRS declaration exists (%s)', (crs) => {
      expect(() => requireDeclaredProjectCrs(crs)).toThrow(/no declared coordinate reference system/i)
    },
  )
})

describe('database survey point coordinates', () => {
  it('normalizes PostgreSQL numeric strings before projection', () => {
    expect(finiteSurveyCoordinate('251234.567', '9854321.25')).toEqual([251234.567, 9854321.25])
  })

  it.each([
    [null, 1],
    ['', 1],
    ['not-a-coordinate', 1],
    [Number.NaN, 1],
    [1, Number.POSITIVE_INFINITY],
  ])('rejects coordinates that cannot be transformed safely (%s, %s)', (easting, northing) => {
    expect(finiteSurveyCoordinate(easting, northing)).toBeNull()
  })
})
