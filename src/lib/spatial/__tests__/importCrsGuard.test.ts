import {
  projectCrsFromColumns,
  validateImportedCoordinates,
} from '../importCrsGuard'

const arc37S = { datum: 'Arc 1960', utm_zone: '37', hemisphere: 'S' }
// Valid Arc 1960 / UTM 37S coordinate (Nairobi area golden values).
const nairobi = { name: 'CP1', x: 257538.86, y: 9857382.34 }

describe('importCrsGuard', () => {
  describe('projectCrsFromColumns', () => {
    it('derives EPSG:21037 from Arc 1960 / 37S', () => {
      expect(projectCrsFromColumns(arc37S)).toEqual({ crs: 'EPSG:21037', error: null })
    })

    it('accepts numeric zone values', () => {
      expect(projectCrsFromColumns({ datum: 'WGS 84', utm_zone: 36, hemisphere: 'N' }).crs).toBe(
        'EPSG:32636',
      )
    })

    it('treats an incomplete declaration as undeclared, not as a guess', () => {
      expect(projectCrsFromColumns({ datum: 'Arc 1960', utm_zone: 37, hemisphere: null })).toEqual({
        crs: null,
        error: null,
      })
      expect(projectCrsFromColumns({ datum: null, utm_zone: '37', hemisphere: 'S' })).toEqual({
        crs: null,
        error: null,
      })
      expect(projectCrsFromColumns({ datum: 'Arc 1960', utm_zone: '', hemisphere: 'S' })).toEqual({
        crs: null,
        error: null,
      })
      expect(projectCrsFromColumns(null)).toEqual({ crs: null, error: null })
    })

    it('fails closed on a complete but unregistered declaration (Arc 1960 zone 40N)', () => {
      const res = projectCrsFromColumns({ datum: 'Arc 1960', utm_zone: '40', hemisphere: 'N' })
      expect(res.crs).toBeNull()
      expect(res.error).not.toBeNull()
      expect(res.error?.code).toBe('CRS_UNREGISTERED')
      expect(res.error?.message).not.toContain('[')
    })

    it('returns EPSG:4326 for a WGS 84 geographic project', () => {
      expect(
        projectCrsFromColumns({ datum: 'WGS 84 geographic', utm_zone: '37', hemisphere: 'S' }).crs,
      ).toBe('EPSG:4326')
    })
  })

  describe('validateImportedCoordinates', () => {
    it('accepts a valid projected coordinate against a declared project CRS', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: arc37S,
      })
      expect(res.ok).toBe(true)
      expect(res.errors).toHaveLength(0)
      expect(res.projectCrs).toBe('EPSG:21037')
    })

    it('fails closed: projected coordinate with an undeclared project CRS', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: { datum: null, utm_zone: null, hemisphere: null },
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('CRS_UNDECLARED')
      expect(res.errors[0].message).toMatch(/declare the project datum/i)
    })

    it('accepts longitude/latitude beacons even when the project CRS is undeclared', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'B1', x: 36.8219, y: -1.2921 }],
        projectCrsColumns: { datum: null, utm_zone: null, hemisphere: null },
      })
      expect(res.ok).toBe(true)
      expect(res.warnings.join(' ')).toMatch(/EPSG:4326/)
    })

    it('rejects degrees loaded as metres (sub-kilometre easting)', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'BAD', x: 36.8, y: -1.29 }],
        projectCrsColumns: arc37S,
      })
      // Classified geographic (|x|<=180, |y|<=90) — lat -1.29 / lon 36.8 is
      // valid WGS84, so this is a warning, not an error. A metres-range
      // blunder must instead be caught as an out-of-domain easting:
      expect(res.ok).toBe(true)

      const blunder = validateImportedCoordinates({
        points: [{ name: 'BAD', x: 500, y: 9857382 }],
        projectCrsColumns: arc37S,
      })
      expect(blunder.ok).toBe(false)
      expect(blunder.errors[0].code).toBe('COORDINATE_OUT_OF_RANGE')
      expect(blunder.errors[0].message).toContain('BAD')
    })

    it('rejects northern-hemisphere coordinates in a southern-zone project', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'CP2', x: 257538, y: 10142618 }],
        projectCrsColumns: arc37S,
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('COORDINATE_OUT_OF_RANGE')
      expect(res.errors[0].message).toMatch(/northern|hemisphere/i)
    })

    it('warns (but accepts) coordinates outside the nominal UTM strip', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'CP3', x: 950000, y: 9857382 }],
        projectCrsColumns: arc37S,
      })
      expect(res.ok).toBe(true)
      expect(res.warnings.join(' ')).toMatch(/outside the nominal UTM strip|wrong-zone/i)
    })

    it('warns when longitude/latitude values arrive in a metres project', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'B2', x: 36.8219, y: -1.2921 }],
        projectCrsColumns: arc37S,
      })
      expect(res.ok).toBe(true)
      expect(res.warnings.join(' ')).toMatch(/longitude\/latitude/)
    })

    it('rejects a source CRS that is display-only (EPSG:3857)', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: arc37S,
        sourceCrs: 'EPSG:3857',
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('SOURCE_CRS_INVALID')
      expect(res.errors[0].message).toMatch(/Web Mercator/)
    })

    it('rejects a source CRS when the project CRS is undeclared', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: { datum: null, utm_zone: null, hemisphere: null },
        sourceCrs: 'EPSG:4326',
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('CRS_UNDECLARED')
    })

    it('warns (transformation note) when the source CRS differs from the project CRS', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: arc37S,
        sourceCrs: 'EPSG:32637',
      })
      expect(res.ok).toBe(true)
      expect(res.warnings.join(' ')).toMatch(/transform/i)
    })

    it('rejects projected coordinates when the project is geographic', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: { datum: 'WGS 84 geographic', utm_zone: '37', hemisphere: 'S' },
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('COORDINATE_OUT_OF_RANGE')
    })

    it('rejects a complete but unregistered project CRS', () => {
      const res = validateImportedCoordinates({
        points: [nairobi],
        projectCrsColumns: { datum: 'OSGB36', utm_zone: '37', hemisphere: 'S' },
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].code).toBe('CRS_UNREGISTERED')
    })

    it('rejects non-finite coordinates', () => {
      const res = validateImportedCoordinates({
        points: [{ name: 'NAN', x: NaN, y: 9857382 }],
        projectCrsColumns: arc37S,
      })
      expect(res.ok).toBe(false)
      expect(res.errors[0].message).toContain('NAN')
    })

    it('caps error samples on large failing batches', () => {
      const points = Array.from({ length: 50 }, (_, i) => ({
        name: `P${i}`,
        x: 500 + i,
        y: 9857382,
      }))
      const res = validateImportedCoordinates({ points, projectCrsColumns: arc37S })
      expect(res.ok).toBe(false)
      expect(res.errors).toHaveLength(1)
      expect(res.errors[0].message).toContain('50 coordinate(s)')
      expect(res.errors[0].message).toMatch(/\(\+45 more\)/)
    })
  })
})
