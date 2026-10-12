import Papa from 'papaparse'
import { checkDeviations } from '../asBuiltDeviation'
import {
  deviationReportToCsv,
  makeAsBuiltPointsCsvTemplate,
  makeDesignProfileCsvTemplate,
  parseAsBuiltPointsCsv,
  parseDesignProfileCsv,
} from '../asBuiltDeviationCsv'

describe('as-built deviation CSV workflow', () => {
  it('parses design profiles with normalized column names and rejects malformed rows', () => {
    expect(parseDesignProfileCsv('\uFEFFChainage (m),Design RL (m)\r\n0,100.25\r\n20,100.50')).toEqual([
      { chainage: 0, elevation: 100.25 },
      { chainage: 20, elevation: 100.5 },
    ])
    expect(() => parseDesignProfileCsv('chainage_m,design_rl_m\n0,100\n20,nope')).toThrow(/data row 2.*finite decimal/i)
    expect(() => parseDesignProfileCsv('chainage_m,design_rl_m')).toThrow(/no data rows/i)
  })

  it('parses quoted observation descriptions, requires IDs, and rejects duplicate IDs', () => {
    expect(parseAsBuiltPointsCsv('point_id,chainage_m,observed_rl_m,description\nP-1,0,100,"centreline, west"')).toEqual([
      { id: 'P-1', chainage: 0, elevation: 100, description: 'centreline, west' },
    ])
    expect(() => parseAsBuiltPointsCsv('point_id,chainage_m,observed_rl_m\nP-1,0,100\nP-1,10,100.1')).toThrow(/duplicated/i)
    expect(() => parseAsBuiltPointsCsv('point_id,chainage_m,observed_rl_m\nP-1,,100')).toThrow(/chainage.*finite decimal/i)
  })

  it('provides empty import templates with the documented column names', () => {
    expect(Papa.parse(makeDesignProfileCsvTemplate().replace(/^\uFEFF/, ''), { header: true }).meta.fields).toEqual(['chainage_m', 'design_rl_m'])
    expect(Papa.parse(makeAsBuiltPointsCsvTemplate().replace(/^\uFEFF/, ''), { header: true }).meta.fields).toEqual(['point_id', 'chainage_m', 'observed_rl_m', 'description'])
  })

  it('exports every result and provenance, leaves unassessed measurements blank, and protects spreadsheet formulas', () => {
    const report = checkDeviations(
      [{ chainage: 0, elevation: 100 }, { chainage: 10, elevation: 101 }],
      [
        { id: '=HYPERLINK("https://bad.example")', chainage: 0, elevation: 100.005, description: 'OK' },
        { id: 'OUT', chainage: 11, elevation: 101.01 },
      ],
      { label: 'Project screen', passLimit: 10, marginalLimit: 15 },
    )
    const csv = deviationReportToCsv(report, 'BM-01, local project datum', 'Drawing C-01 rev 2, clause 5')
    const rows = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data

    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('vertical_reference')
    expect(rows[1][0]).toBe("'=HYPERLINK(\"https://bad.example\")")
    expect(rows[1][10]).toBe('BM-01, local project datum')
    expect(rows[2][0]).toBe('OUT')
    expect(rows[2][3]).toBe('')
    expect(rows[2][5]).toBe('')
    expect(rows[2][6]).toBe('NOT ASSESSED')
  })
})
