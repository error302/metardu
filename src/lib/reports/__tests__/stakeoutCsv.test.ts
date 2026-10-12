import { parseStakeoutCsv } from '../stakeoutCsv'

const header = 'point_id,design_e,design_n,design_z,staked_e,staked_n,staked_z,observed_at,notes,accuracy_m\n'

describe('stakeout CSV evidence', () => {
  it('reads quoted notes and preserves absent levels and observation times', () => {
    const [point] = parseStakeoutCsv(header + 'MH-1,500000,9860000,,500000.004,9860000.003,,,"Pipe, north run",\n')
    expect(point.design.elevation).toBeUndefined()
    expect(point.staked.elevation).toBeUndefined()
    expect(point.timestamp).toBe('')
    expect(point.notes).toBe('Pipe, north run')
  })

  it.each(['', 'wrong', '500000junk', 'Infinity'])('rejects measured easting %s without zero substitution', (value) => {
    expect(() => parseStakeoutCsv(header + `MH-1,500000,9860000,100,${value},9860000,100,,,0.005`)).toThrow(/row 2.*staked_e/i)
  })

  it('rejects duplicate point identifiers', () => {
    const row = 'MH-1,500000,9860000,100,500000,9860000,100,,,0.005\n'
    expect(() => parseStakeoutCsv(header + row + row)).toThrow(/duplicate/i)
  })

  it('retains supplied timestamps and unknown instrument precision', () => {
    const [point] = parseStakeoutCsv(header + 'MH-1,500000,9860000,100,500000,9860000,100,2026-10-08T08:00:00Z,,0')
    expect(point.timestamp).toBe('2026-10-08T08:00:00Z')
    expect(point.accuracyM).toBe(0)
  })

  it('rejects missing columns and extra unquoted values instead of shifting measurements', () => {
    expect(() => parseStakeoutCsv('id,e,n\nP1,1,2')).toThrow(/columns/i)
    expect(() => parseStakeoutCsv(header + 'MH-1,500000,9860000,100,500000,9860000,100,,,0.005,extra')).toThrow(/CSV/i)
  })
})
