import { generateEngineeringSchedulePdf } from '../engineeringSchedulePdf'
const fixtureCrs = 'EPSG:21037'

describe('engineering schedule PDF', () => {
  it('prints wide road schedules in declared column groups with intact rounded measurements', () => {
    const options = { title: 'Synthetic road', projectName: 'Synthetic', sections: [{ title: 'Horizontal alignment',
      headers: ['PI', 'Tangent m', 'TS m', 'ST m'], rows: [['PI-1', 330.48982424376516, 1669.5101757562347, 2200.7490737947037]],
      columnGroups: [[0, 1], [0, 2, 3]], decimalPlaces: 3,
    }] }
    const text = new TextDecoder().decode(generateEngineeringSchedulePdf(options))
    expect(text).toContain('Horizontal alignment - part 1 of 2')
    expect(text).toContain('Horizontal alignment - part 2 of 2')
    expect(text).toContain('(330.490)')
    expect(text).toContain('(1669.510)')
    expect(text).not.toContain('330.48982424376516')
  })

  it('rejects a column grouping that would silently omit a measurement', () => {
    const options = { title: 'Synthetic road', projectName: 'Synthetic', sections: [{ title: 'Coordinates',
      headers: ['ID', 'Easting', 'Northing'], rows: [['A', 0, 1]], columnGroups: [[0, 1]],
    }] }
    expect(() => generateEngineeringSchedulePdf(options)).toThrow(/column|omit|group/i)
  })
  it('generates a printable report with project identity, saved rows, and draft status', () => {
    const pdf = generateEngineeringSchedulePdf({
      title: 'Drainage engineering schedules',
      projectName: 'Site Drainage Phase 1',
      coordinateReference: fixtureCrs,
      generatedAt: new Date('2026-10-05T09:00:00.000Z'),
      sections: [{
        title: 'Manhole levels',
        headers: ['Manhole', 'Invert RL m'],
        rows: [['MH-01', 100.125], ['MH-02', undefined]],
      }],
      notes: ['Intermediate ground levels were not surveyed.'],
    })

    const text = new TextDecoder().decode(pdf)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toContain('DRAFT - REVIEW REQUIRED - NOT APPROVED FOR CONSTRUCTION')
    expect(text).toContain('Site Drainage Phase 1')
    expect(text).toContain('MH-01')
    expect(text).toContain('Intermediate ground levels were not surveyed.')
    expect(text).toContain('Page 1 of 1')
  })

  it('keeps an empty saved-data section explicit instead of inventing schedule rows', () => {
    const pdf = generateEngineeringSchedulePdf({
      title: 'Road engineering schedules',
      projectName: 'Access Road',
      sections: [{ title: 'Vertical alignment', headers: ['Chainage'], rows: [] }],
    })

    expect(new TextDecoder().decode(pdf)).toContain('No rows available in the saved project data.')
  })
})
