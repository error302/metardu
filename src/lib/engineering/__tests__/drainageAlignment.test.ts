import { formatDrainageAlignmentVertices, parseDrainageAlignmentVertices } from '../drainageAlignment'

describe('drainage alignment vertex text', () => {
  it('parses projected Easting,Northing rows and ignores blank lines', () => {
    expect(parseDrainageAlignmentVertices('\n500010.25,9800000\r\n500020,9800010\n')).toEqual({
      vertices: [
        { easting: 500010.25, northing: 9800000 },
        { easting: 500020, northing: 9800010 },
      ],
      issues: [],
    })
  })

  it('retains valid rows while reporting malformed and non-finite rows', () => {
    const result = parseDrainageAlignmentVertices('500010,9800000\n500020\nNaN,9800020\n,9800030')
    expect(result.vertices).toEqual([{ easting: 500010, northing: 9800000 }])
    expect(result.issues).toHaveLength(3)
    expect(result.issues[0]).toMatch(/line 2/)
    expect(result.issues[1]).toMatch(/line 3/)
    expect(result.issues[2]).toMatch(/line 4/)
  })

  it('formats saved vertices without reducing coordinate precision', () => {
    expect(formatDrainageAlignmentVertices([
      { easting: 500010.123456, northing: 9800000.5 },
      { easting: 500020, northing: 9800010 },
    ])).toBe('500010.123456,9800000.5\n500020,9800010')
    expect(formatDrainageAlignmentVertices(undefined)).toBe('')
  })
})
