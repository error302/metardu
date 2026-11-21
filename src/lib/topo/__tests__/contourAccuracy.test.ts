import {
  ASPRS_1990_CLASS1_FACTOR,
  ASPRS_NMAS_EQUIVALENT_FACTOR,
  CONTOUR_INTERVAL_BASIS,
  contourAccuracyBasisLine,
  contourIntervalGuidance,
} from '../contourAccuracy'

describe('contour interval accuracy guidance', () => {
  it('warns when the chosen interval is finer than 3.29 x declared RMSEv supports', () => {
    // 0.10 m RMSE -> NMAS-equivalent guideline 0.329 m; 0.25 m is finer.
    const guidance = contourIntervalGuidance({ contourIntervalM: 0.25, sourceVerticalRmseText: '0.10' })
    expect(guidance.rmseM).toBe(0.1)
    expect(guidance.nmasEquivalentCiM).toBeCloseTo(0.329, 6)
    expect(guidance.asprs1990Class1CiM).toBeCloseTo(0.3, 6)
    expect(guidance.finerThanSource).toBe(true)
    expect(guidance.warning).toMatch(/0\.25 m is finer than the 0\.329 m guideline/)
    expect(guidance.warning).toMatch(/ASPRS Ed\. 2 Table B\.6/)
    expect(guidance.basis).toBe(CONTOUR_INTERVAL_BASIS)
  })

  it('stays silent for a conservative (coarser) interval', () => {
    const guidance = contourIntervalGuidance({ contourIntervalM: 0.5, sourceVerticalRmseText: '0.10' })
    expect(guidance.finerThanSource).toBe(false)
    expect(guidance.warning).toBeNull()
    // The basis is still available for printing with the deliverable.
    expect(guidance.basis).toMatch(/3\.29/)
  })

  it('declares nothing and invents no tolerance when RMSE is not declared', () => {
    const guidance = contourIntervalGuidance({ contourIntervalM: 0.25, sourceVerticalRmseText: '' })
    expect(guidance.rmseM).toBeNull()
    expect(guidance.finerThanSource).toBe(false)
    expect(guidance.warning).toBeNull()
    expect(guidance.basis).toBeNull()
  })

  it('rejects unparsable or non-positive RMSE declarations instead of guessing', () => {
    for (const text of ['abc', '-1', '0', 'NaN']) {
      const guidance = contourIntervalGuidance({ contourIntervalM: 0.5, sourceVerticalRmseText: text })
      expect(guidance.rmseInvalid).toBe(true)
      expect(guidance.warning).toMatch(/positive number of metres/)
    }
  })

  it('accepts comma decimals and surrounding whitespace', () => {
    const guidance = contourIntervalGuidance({ contourIntervalM: 0.5, sourceVerticalRmseText: ' 0,10 ' })
    expect(guidance.rmseInvalid).toBe(false)
    expect(guidance.rmseM).toBeCloseTo(0.1, 6)
  })

  it('keeps the cited factors distinct from each other', () => {
    expect(ASPRS_NMAS_EQUIVALENT_FACTOR).toBe(3.29)
    expect(ASPRS_1990_CLASS1_FACTOR).toBe(3)
  })
})

describe('contourAccuracyBasisLine', () => {
  it('prints the declared RMSE, the guideline and the citation for deliverables', () => {
    const line = contourAccuracyBasisLine('0.10', 0.25)
    expect(line).toContain('METARDU source vertical RMSE (declared): 0.1 m')
    expect(line).toContain('3.29 x RMSEv = 0.329 m')
    expect(line).toContain('ASPRS Ed. 2 Table B.6')
    expect(line).toContain('NOTE: chosen interval is finer than the 0.329 m guideline')
  })

  it('is empty when the surveyor declared no RMSE', () => {
    expect(contourAccuracyBasisLine('', 0.25)).toBe('')
  })

  it('omits the finer-than note when the interval is conservative', () => {
    const line = contourAccuracyBasisLine('0.10', 1)
    expect(line).toContain('METARDU source vertical RMSE (declared): 0.1 m')
    expect(line).not.toContain('NOTE')
  })
})
