import { parseSettingOutSheetCsv } from '../settingOutSheetCsv'

describe('general setting-out point-list CSV', () => {
  it('reads a headed CSV with optional offsets and quoted remarks without changing coordinates', () => {
    const points = parseSettingOutSheetCsv([
      'Point ID,Design E,Design N,Bearing,Distance,Offset E,Offset N,Entered check,Remarks',
      'P-01,500010.125,9900000.250,45°30\'00",25.5,0.1,-0.2,,"north, retaining wall"',
    ].join('\n'))

    expect(points).toEqual([{
      pointId: 'P-01',
      designE: 500010.125,
      designN: 9900000.25,
      bearing: '45°30\'00"',
      distance: '25.5',
      offsetE: 0.1,
      offsetN: -0.2,
      remarks: 'north, retaining wall',
    }])
  })

  it('accepts Excel UTF-8 BOM headers and rejects non-decimal numeric syntax', () => {
    expect(parseSettingOutSheetCsv('\uFEFFPoint ID,Design E,Design N\nP-01,500010,9900000')).toHaveLength(1)
    expect(() => parseSettingOutSheetCsv('P-01,0x7a120,9900000')).toThrow(/decimal number/i)
    expect(() => parseSettingOutSheetCsv('P-01,500010,9900000,,0x1')).toThrow(/distance|decimal/i)
  })

  it('accepts tab-separated spreadsheet rows and rejects incomplete, duplicate, and invalid values', () => {
    expect(parseSettingOutSheetCsv('P-01\t500010\t9900000')).toHaveLength(1)
    expect(() => parseSettingOutSheetCsv('P-01,500010,9900000\np-01,500020,9900000')).toThrow(/duplicated/i)
    expect(() => parseSettingOutSheetCsv('P-01,500010,')).toThrow(/northing/i)
    expect(() => parseSettingOutSheetCsv('P-01,500010,9900000,,,,,,,extra')).toThrow(/9 columns/i)
  })

  it('refuses oversized inputs and more than one thousand points', () => {
    expect(() => parseSettingOutSheetCsv('x'.repeat(400_001))).toThrow(/too large/i)
    const rows = Array.from({ length: 1_001 }, (_, index) => `P${index + 1},500010,9900000`).join('\n')
    expect(() => parseSettingOutSheetCsv(rows)).toThrow(/up to 1000/i)
  })
})
