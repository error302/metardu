import { computeCrossSection, computeEarthwork, parseEarthworkCSV, type CrossSectionInput, type RoadTemplate } from '../earthworksEngine'

const template: RoadTemplate = { carriagewayWidth: 4, shoulderWidth: 0, camber: 0, cutSlopeH: 1, fillSlopeH: 1 }
const flat = (chainage = 0): CrossSectionInput => ({ chainage, centrelineRL: 1, formationRL: 0,
  leftShots: [{ offset: -10, rl: 1 }], rightShots: [{ offset: 10, rl: 1 }] })

describe('standalone earthworks integrity', () => {
  it('integrates the complete cut section including both observed daylight slopes', () => {
    const section = computeCrossSection(flat(), template)
    expect(section.cutArea).toBeCloseTo(5, 10)
    expect(section.fillArea).toBe(0)
    expect(section.leftCatchPoint?.offset).toBe(-3)
    expect(section.rightCatchPoint?.offset).toBe(3)
    expect(section.arithmeticCheck.passed).toBe(true)
  })
  it('separates cut and fill when measured ground crosses formation', () => {
    const section = computeCrossSection({ ...flat(), centrelineRL: 0,
      leftShots: [{ offset: -10, rl: -10 }], rightShots: [{ offset: 10, rl: 10 }] },
    { ...template, cutSlopeH: 0.5, fillSlopeH: 0.5 })
    expect(section.cutArea).toBeCloseTo(4, 10)
    expect(section.fillArea).toBeCloseTo(4, 10)
  })
  it('includes the actual crowned formation rather than a flat edge-to-edge line', () => {
    expect(computeCrossSection(flat(), { ...template, camber: 10 }).cutArea).toBeCloseTo(5.84, 10)
  })
  it('rejects missing surveyed daylight instead of inventing a catch point', () => {
    expect(() => computeCrossSection({ ...flat(), leftShots: [{ offset: -2, rl: 1 }] }, template)).toThrow(/extend measured ground/i)
  })
  it('rejects unknown levels, wrongly signed shots and duplicate offsets', () => {
    expect(() => computeCrossSection({ ...flat(), formationRL: NaN }, template)).toThrow()
    expect(() => computeCrossSection({ ...flat(), leftShots: [{ offset: 10, rl: 1 }] }, template)).toThrow()
    expect(() => computeCrossSection({ ...flat(), leftShots: [{ offset: -10, rl: 1 }, { offset: -10, rl: 2 }] }, template)).toThrow()
  })
  it('uses actual spacing and rejects duplicate or reversing station schedules', () => {
    const sections = [computeCrossSection(flat(), template), computeCrossSection(flat(37), template)]
    expect(computeEarthwork(sections, 1).totalCutEndArea).toBe(185)
    expect(() => computeEarthwork([sections[0], sections[0]], 1)).toThrow()
    expect(() => computeEarthwork([...sections].reverse(), 1)).toThrow()
    expect(() => computeEarthwork(sections, 0)).toThrow()
  })
  it('does not invent material factors or middle-section quantities', () => {
    const result = computeEarthwork([computeCrossSection(flat(), template), computeCrossSection(flat(37), template)])
    expect(result.method).toBe('average-end-area')
    expect(result.shrinkageFactor).toBeNull()
    expect(result.adjustedCut).toBeNull()
    expect(result).not.toHaveProperty('totalCutPrismoidal')
    expect(result.massOrdinates.at(-1)?.ordinate).toBe(185)
  })
  it('requires complete CSV levels and rejects partial shot pairs without losing valid zero levels', () => {
    expect(() => parseEarthworkCSV('0,0,1,')).toThrow()
    expect(() => parseEarthworkCSV('0,0,1,0,10,')).toThrow()
    const sections = parseEarthworkCSV('0,0,1,0,10,1,,,,,,,10,1')
    expect(sections[0].formationRL).toBe(0)
    expect(sections[0].leftShots).toEqual([{ offset: -10, rl: 1 }])
  })
})
