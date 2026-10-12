import {
  buildRoadFieldStations,
  formatRoadChainage,
  parseRoadFieldPlan,
  validateRoadFieldPlan,
  type RoadFieldPlanDraft,
} from '../roadFieldPlan'
import type { RoadFieldPlan } from '@/types/engineering'

const validPlan: RoadFieldPlanDraft = {
  startChainageM: 0,
  endChainageM: 50,
  stationIntervalM: 20,
  leftExtentM: 8,
  rightExtentM: 6,
  projectCrs: 'Client-specified CRS',
  controlReference: 'BM-01 / CP-02',
  featureCodes: ['CL', 'LE'],
}
const validRoadPlan: RoadFieldPlan = {
  ...validPlan,
  startChainageM: validPlan.startChainageM ?? 0,
  endChainageM: validPlan.endChainageM ?? 0,
  stationIntervalM: validPlan.stationIntervalM ?? 1,
}

describe('road field plan', () => {
  it('generates regular stations and always includes the entered end chainage', () => {
    expect(buildRoadFieldStations(validRoadPlan)).toEqual([0, 20, 40, 50])
  })

  it('does not invent stations when the plan range or interval is invalid', () => {
    expect(validateRoadFieldPlan({ ...validPlan, endChainageM: 10, startChainageM: 20 })).toContain('End chainage')
    expect(validateRoadFieldPlan({ ...validPlan, stationIntervalM: 0 })).toContain('interval')
  })

  it('requires the approved project CRS and control source before field collection', () => {
    expect(validateRoadFieldPlan({ ...validPlan, projectCrs: '   ' })).toContain('approved project CRS')
    expect(validateRoadFieldPlan({ ...validPlan, controlReference: '' })).toContain('control or benchmark')
    expect(parseRoadFieldPlan({ ...validPlan, projectCrs: '' })).toBeNull()
  })

  it('rejects plans that would create an impractically large station list', () => {
    expect(validateRoadFieldPlan({ ...validPlan, endChainageM: 1_000_000, stationIntervalM: 1 })).toContain('exceeds')
  })

  it('formats chainage as kilometre plus metre notation', () => {
    expect(formatRoadChainage(1234.5)).toBe('1+234.500')
    expect(formatRoadChainage(7)).toBe('0+007.000')
  })

  it('only accepts saved plans with supported codes and finite values', () => {
    expect(parseRoadFieldPlan({ ...validPlan, startChainageM: Number.NaN })).toBeNull()
    expect(parseRoadFieldPlan({ ...validPlan, featureCodes: ['UNSAFE_CODE'] })).toBeNull()
    expect(parseRoadFieldPlan({ ...validPlan })).toEqual(validPlan)
  })
})
