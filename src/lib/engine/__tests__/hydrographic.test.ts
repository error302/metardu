import { applyTideCorrection } from '../hydrographic'

describe('applyTideCorrection', () => {
  it('positive correction increases depth', () => {
    expect(applyTideCorrection(5.0, 0.3)).toBeCloseTo(5.3, 6)
  })

  it('negative correction decreases depth', () => {
    expect(applyTideCorrection(5.0, -0.5)).toBeCloseTo(4.5, 6)
  })

  it('zero correction leaves depth unchanged', () => {
    expect(applyTideCorrection(3.75, 0)).toBeCloseTo(3.75, 6)
  })

  it('result is depth + tide', () => {
    const depth = 12.345
    const tide = -1.234
    expect(applyTideCorrection(depth, tide)).toBeCloseTo(depth + tide, 6)
  })
})
