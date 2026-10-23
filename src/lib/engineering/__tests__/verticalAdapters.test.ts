import { verticalCurve as computeProfile, VerticalCurveSchema } from '../compute'
import { verticalCurve as curveProfile } from '../curves'

const base = { g1: -2, g2: 4, L: 205, chainage_VIP: 1000.125, elevation_VIP: 100.123456789 }
const computeInput = (change = {}) => VerticalCurveSchema.parse({ ...base, ...change })
const curvesInput = (change = {}) => ({ gradeIn: base.g1, gradeOut: base.g2, length: base.L,
  chainage_VIP: base.chainage_VIP, elevation_VIP: base.elevation_VIP, ...change })

describe('legacy VPI vertical adapters', () => {
  it.each(['compute', 'curves'])('%s retains exact endpoints, a sag and full numerical precision', kind => {
    const result = kind === 'compute' ? computeProfile(computeInput()) : curveProfile(curvesInput())
    expect(result.chainage_VPC).toBe(897.625)
    expect(result.chainage_VPT).toBe(1102.625)
    expect(result.elevationTable[0].chainage).toBe(897.625)
    expect(result.elevationTable[0].elevation).toBeCloseTo(102.173456789, 11)
    expect(result.elevationTable.at(-1)?.chainage).toBe(1102.625)
    expect(result.elevationTable.at(-1)?.elevation).toBeCloseTo(104.223456789, 11)
    expect(result.elevationTable.some(row => Math.abs(row.chainage - (897.625 + 205 / 3)) < 1e-10 && Math.abs(row.grade) < 1e-12)).toBe(true)
    expect(result.kValue).toBeCloseTo(205 / 6, 12)
  })

  it.each(['compute', 'curves'])('%s represents equal grades with an undefined K', kind => {
    const result = kind === 'compute' ? computeProfile(computeInput({ g1: 2, g2: 2 })) : curveProfile(curvesInput({ gradeIn: 2, gradeOut: 2 }))
    expect(result.kValue).toBeNull()
    expect(result.isCrest).toBe(false)
    expect(result.elevationTable.every(row => row.grade === 2)).toBe(true)
  })

  it('does not invent SSD or earthwork cut/fill from curve geometry', () => {
    const result = computeProfile(computeInput())
    expect(result.sightDistance).toBeNull()
    expect(result.elevationTable.every(row => row.cutFill === null)).toBe(true)
    expect(result.sightDistanceStatus).toBe('NOT_ASSESSED')
    expect(result.standardCompliance).toBe('NOT_ASSESSED')
    expect(result.verticalDatumStatus).toBe('NOT_VERIFIED')
    expect(result.elevationTable[0].tangentOffset).toBe(0)
    expect(result.elevationTable.at(-1)?.tangentOffset).toBeCloseTo(6.15, 12)
  })

  it('does not insert a default design speed or claim geometry is adopted road criteria', () => {
    expect(VerticalCurveSchema.parse(base)).not.toHaveProperty('designSpeedKph')
    expect(() => computeProfile(computeInput({ L: 20, chainage_VIP: -5, g1: -17 }))).not.toThrow()
  })

  it.each(['designSpeedKph', 'K', 'unrecognizedCriteria'])('refuses ambiguous legacy field %s instead of silently using or dropping it', field => {
    expect(() => VerticalCurveSchema.parse({ ...base, [field]: 80 })).toThrow()
  })

  it.each(['compute', 'curves'])('%s refuses collapsed levels at extreme finite elevation', kind => {
    expect(() => kind === 'compute' ? computeProfile(computeInput({ elevation_VIP: 1e30 })) : curveProfile(curvesInput({ elevation_VIP: 1e30 }))).toThrow(/precision/i)
  })

  it.each([0, -10, NaN])('both adapters refuse invalid length %s', length => {
    expect(() => computeProfile(computeInput({ L: length }))).toThrow()
    expect(() => curveProfile(curvesInput({ length }))).toThrow()
  })

  it('does not round small grade changes to zero', () => {
    const result = curveProfile(curvesInput({ gradeIn: 1.23456789, gradeOut: 1.23457789 }))
    expect(result.algebraicDiff).toBeCloseTo(0.00001, 14)
    expect(result.elevationTable[0].grade).toBe(1.23456789)
    expect(result.elevationTable.at(-1)?.grade).toBe(1.23457789)
  })

  it.each([0, -1, NaN, Infinity, Number.MIN_VALUE, 0.00001])('both adapters bound unsafe interval %s', interval => {
    expect(() => computeProfile(computeInput({ interval }))).toThrow()
    expect(() => curveProfile(curvesInput({ interval }))).toThrow()
  })

  it.each([Infinity, Number.MAX_VALUE, Number.MIN_VALUE])('both adapters refuse unrepresentable length %s', length => {
    expect(() => computeProfile(computeInput({ L: length }))).toThrow()
    expect(() => curveProfile(curvesInput({ length }))).toThrow()
  })

  it('allows deliberate coarse sampling but retains endpoints and the stationary point', () => {
    const result = computeProfile(computeInput({ interval: 10000 }))
    expect(result.elevationTable).toHaveLength(3)
    expect(result.elevationTable[0].grade).toBe(-2)
    expect(result.elevationTable[1].grade).toBeCloseTo(0, 12)
    expect(result.elevationTable[2].grade).toBe(4)
  })

  it('returns JSON-safe null K and unassessed evidence for a flat zero-level profile', () => {
    const result = computeProfile(computeInput({ g1: 0, g2: 0, elevation_VIP: 0, chainage_VIP: -1, L: 20 }))
    expect(result.curveType).toBe('straight')
    expect(result.elevationTable.every(row => row.elevation === 0 && row.tangentOffset === 0 && row.cutFill === null)).toBe(true)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
