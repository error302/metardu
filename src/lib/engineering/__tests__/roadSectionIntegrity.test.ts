import { computeCamberProfile, computeCutFillArea, computeSlopeIntercept, parseSlopeRatio, computeFormationLine } from '../crossSectionGeometry'

describe('measured road section geometry integrity', () => {
  it('drops a 2.5 percent camber by 0.0875m across a 3.5m half-width', () => {
    const profile = computeCamberProfile(7, 2.5, 100)
    expect(profile[0].level).toBeCloseTo(99.9125, 10)
    expect(profile.at(-1)?.level).toBeCloseTo(99.9125, 10)
  })
  it('finds the nearest left-side daylight, not a more distant crossing', () => {
    const ground = [-10, -6, -4, -2, 0, 10].map((offset, i) => ({ offset, level: [20, 1, 10, 1, 1, 1][i] }))
    expect(computeSlopeIntercept(-2, 0, 1, true, ground)?.offset).toBeCloseTo(-30 / 5.5, 10)
  })
  it('does not flip a section net area merely because its centre lies below design', () => {
    const ground = [{ offset: -5, level: 5 }, { offset: 0, level: -1 }, { offset: 5, level: 5 }]
    expect(computeCutFillArea(ground, [{ offset: -5, level: 0 }, { offset: 5, level: 0 }])).toBeCloseTo(20, 10)
  })
  it('rejects a zero slope denominator instead of producing infinite geometry', () => {
    expect(() => parseSlopeRatio('1:0')).toThrow()
  })
  it('requires an explicit shoulder crossfall instead of applying an invented standard', () => {
    const template = { carriagewayWidth: 6, shoulderWidth: 1, cutSlope: '1:2', fillSlope: '1:1.5', camber: 0, subgradeDepth: 0 }
    expect(() => computeFormationLine(template, 0, [{ offset: -10, level: 1 }, { offset: 10, level: 1 }], true)).toThrow(/shoulder/i)
  })
  it.each([-1,1])('does not invent daylight when same-sign residuals underflow in a product (side %s)',direction=>{
    const ground=[1,2].map(value=>({offset:direction*value*1e-200,level:2e-200})).sort((a,b)=>a.offset-b.offset)
    expect(computeSlopeIntercept(direction*1e-200,0,1,true,ground)).toBeNull()
  })
})
