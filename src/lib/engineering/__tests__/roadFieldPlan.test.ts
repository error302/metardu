import {
  buildRoadFieldStations,
  formatRoadChainage,
  parseRoadFieldPlan,
  resolveRoadFieldPlanCrsCode,
  roadFieldPlanCrsIsBoundToProject,
  summarizeRoadStationCaptures,
  validateRoadFieldPlan,
  type RoadFieldPlanDraft,
} from '../roadFieldPlan'
import type { RoadFieldPlan } from '@/types/engineering'

const REGISTERED_PROJECT_CRS = 'EPSG:21037'
const WGS84_PROJECT_CRS = 'EPSG:32737'
const MISMATCHED_PROJECT_CRS = 'EPSG:32637'

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
    expect(validateRoadFieldPlan({ ...validPlan, stationIntervalM: 0.0005 })).toContain('nearest millimetre')
  })

  it('avoids duplicate stations when rounded endpoints coincide', () => {
    const plan = {
      ...validRoadPlan,
      startChainageM: 0.0001,
      endChainageM: 0.001,
      stationIntervalM: 0.001,
    }

    expect(buildRoadFieldStations(plan)).toEqual([0, 0.001])
  })

  it('requires the approved project CRS and control source before field collection', () => {
    expect(validateRoadFieldPlan({ ...validPlan, projectCrs: '   ' })).toContain('approved project CRS')
    expect(validateRoadFieldPlan({ ...validPlan, controlReference: '' })).toContain('control or benchmark')
    expect(parseRoadFieldPlan({ ...validPlan, projectCrs: '' })).toBeNull()
  })

  it('uses only an explicit registered projected EPSG code for GNSS coordinate transformation', () => {
    expect(resolveRoadFieldPlanCrsCode(`Arc 1960 / UTM zone 37S (${REGISTERED_PROJECT_CRS})`)).toBe(REGISTERED_PROJECT_CRS)
    expect(resolveRoadFieldPlanCrsCode('EPSG:3857')).toBeNull()
    expect(resolveRoadFieldPlanCrsCode('EPSG:99999')).toBeNull()
    expect(resolveRoadFieldPlanCrsCode('UTM zone 37S')).toBeNull()
  })

  it('requires an offline plan CRS to match the project CRS confirmed when it was cached', () => {
    expect(roadFieldPlanCrsIsBoundToProject(`WGS 84 / UTM zone 37S (${WGS84_PROJECT_CRS})`, WGS84_PROJECT_CRS)).toBe(true)
    expect(roadFieldPlanCrsIsBoundToProject(`WGS 84 / UTM zone 37S (${WGS84_PROJECT_CRS})`, null)).toBe(false)
    expect(roadFieldPlanCrsIsBoundToProject(`WGS 84 / UTM zone 37S (${WGS84_PROJECT_CRS})`, MISMATCHED_PROJECT_CRS)).toBe(false)
  })

  it('rejects plans that would create an impractically large station list', () => {
    expect(validateRoadFieldPlan({ ...validPlan, endChainageM: 1_000_000, stationIntervalM: 1 })).toContain('exceeds')
  })

  it('formats chainage as kilometre plus metre notation', () => {
    expect(formatRoadChainage(1234.5)).toBe('1+234.500')
    expect(formatRoadChainage(7)).toBe('0+007.000')
  })

  it('summarizes captured road points only for planned stations and selected codes', () => {
    const status = summarizeRoadStationCaptures(
      [0, 20, 40],
      ['CL', 'LE', 'RE'],
      [
        { notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1' },
        { notes: 'ROAD_CODE=LE; CHAINAGE_M=0.0004; METARDU_POINT_ID=RD2' },
        { notes: 'ROAD_CODE=CL; CHAINAGE_M=20; METARDU_POINT_ID=RD3' },
        { notes: 'ROAD_CODE=CULV_IN; CHAINAGE_M=40; METARDU_POINT_ID=RD4' },
        { notes: 'ROAD_CODE=RE; CHAINAGE_M=40.0006; METARDU_POINT_ID=RD5' },
        { notes: 'ROAD_CODE=RE; CHAINAGE_M=not-a-number; METARDU_POINT_ID=RD6' },
        { notes: 'ROAD_CODE=RE; CHAINAGE_M=; METARDU_POINT_ID=RD8' },
        { notes: 'OTHER_CODE=CL; CHAINAGE_M=40; METARDU_POINT_ID=RD7' },
      ],
    )

    expect(status).toEqual([
      { chainageM: 0, pointCount: 2, capturedFeatureCodes: ['CL', 'LE'] },
      { chainageM: 20, pointCount: 1, capturedFeatureCodes: ['CL'] },
      { chainageM: 40, pointCount: 0, capturedFeatureCodes: [] },
    ])
  })

  it('only accepts saved plans with supported codes and finite values', () => {
    expect(parseRoadFieldPlan({ ...validPlan, startChainageM: Number.NaN })).toBeNull()
    expect(parseRoadFieldPlan({ ...validPlan, featureCodes: ['UNSAFE_CODE'] })).toBeNull()
    expect(parseRoadFieldPlan({ ...validPlan })).toEqual(validPlan)
  })
})
