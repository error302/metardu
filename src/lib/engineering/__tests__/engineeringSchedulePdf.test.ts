import { generateEngineeringSchedulePdf } from '../engineeringSchedulePdf'

describe('engineering schedule PDF', () => {
  it('generates a printable report with project identity, saved rows, and draft status', () => {
    const pdf = generateEngineeringSchedulePdf({
      title: 'Drainage engineering schedules',
      projectName: 'Site Drainage Phase 1',
      coordinateReference: 'EPSG:21037',
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
