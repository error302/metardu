const fixtureCrs = 'EPSG:32737'
import { hydrateSavedEngineeringRoad } from '../projectEngineeringPersistence'
import type { EngineeringData, RoadDesignData } from '@/types/engineering'

it('preserves saved road design levels/profiles and drainage when the relational mirror is loaded', () => {
  const road: RoadDesignData = { roadName: 'Synthetic', startChainage: 0, datum: 'WGS84', coordinateSystem: fixtureCrs, roadClass: 'C', designSpeed: 40,
    ips: [], vips: [{ id: 'approved-vip', chainage: 100, reducedLevel: 2, curveLength: 100, kValue: 25 }], verticalStationIntervalM: 25,
    crossSectionTemplate: { carriagewayWidth: 6, shoulderWidth: 0, cutSlope: '2:1', fillSlope: '1.5:1', camber: 0, subgradeDepth: 0 },
    stations: [{ chainage: 0, groundLevel: 1, designLevel: 0, designLevelSource: 'vertical-alignment', groundProfile: [{ offset: -10, level: 1 }, { offset: 10, level: 1 }] }] }
  const saved: EngineeringData = { mode: 'road', standard: 'KRDM2017', drainage: { manholes: [] }, road }
  const legacy: RoadDesignData = { ...road, stations: [{ chainage: 0, groundLevel: 1 }] }
  const hydrated = hydrateSavedEngineeringRoad(saved, legacy)
  expect(hydrated.road).toBe(saved.road)
  expect(hydrated.road?.vips[0]).toMatchObject({ curveLength: 100, kValue: 25 })
  expect(hydrated.road?.verticalStationIntervalM).toBe(25)
  expect(hydrated.road?.stations[0].designLevelSource).toBe('vertical-alignment')
  expect(hydrated.drainage).toBe(saved.drainage)
})
