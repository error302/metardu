import { parseCsvRecords } from '../csvRecords'

describe('parseCsvRecords', () => {
  it('preserves commas, quotes, and line breaks inside quoted fields', () => {
    expect(parseCsvRecords('parcel,name,remarks\r\nP1,"Muli, Jane","said ""survey""\ncomplete"\r\nP2,Ada,ok'))
      .toEqual([
        ['parcel', 'name', 'remarks'],
        ['P1', 'Muli, Jane', 'said "survey"\ncomplete'],
        ['P2', 'Ada', 'ok'],
      ])
  })

  it('rejects unclosed quoted fields rather than shifting columns silently', () => {
    expect(() => parseCsvRecords('parcel,name\nP1,"Muli')).toThrow(/unclosed quoted field/i)
  })
})
