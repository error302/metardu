function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Expected a valid fixture result'); return value }
import { calculateRoadVertical, roadVerticalStation, resolveRoadDesignStations, buildRoadVerticalSchedules } from '../roadVerticalAlignment'
import type { VerticalIP, RoadDesignData } from '@/types/engineering'
const vips: VerticalIP[] = [{ id: 'start', chainage: 0, reducedLevel: 0 }, { id: 'pvi', chainage: 100, reducedLevel: 2, curveLength: 100 }, { id: 'end', chainage: 200, reducedLevel: 0 }]
it('evaluates the supplied crest with exact PVC/PVT connection, grade and valid zero endpoint levels', () => {
  const result = calculateRoadVertical(vips)
  expect(result.issues).toEqual([])
  const alignment = required(result.alignment)
  expect(roadVerticalStation(alignment, 50)).toMatchObject({ elevation: 1, grade: 2, segment: 'curve' })
  expect(roadVerticalStation(alignment, 100)).toMatchObject({ elevation: 1.5, grade: 0 })
  expect(roadVerticalStation(alignment, 150)).toMatchObject({ elevation: 1, grade: -2 })
  expect(roadVerticalStation(alignment, 200)?.elevation).toBe(0)
  expect(roadVerticalStation(alignment, 201)).toBeNull()
})
it('uses supplied K as metres per percent grade change, without an automatic standard K', () => {
  expect(calculateRoadVertical(vips.map(p => p.id === 'pvi' ? { ...p, curveLength: undefined, kValue: 25 } : p)).curves[0].length).toBe(100)
  expect(calculateRoadVertical(vips.map(p => p.id === 'pvi' ? { ...p, curveLength: undefined } : p)).alignment).toBeNull()
})
it('rejects conflicting K/length, duplicate chainages, missing measurements and overlapping/out-of-range curves', () => {
  expect(calculateRoadVertical(vips.map(p => p.id === 'pvi' ? { ...p, kValue: 20 } : p)).alignment).toBeNull()
  expect(calculateRoadVertical([vips[0], { ...vips[1], chainage: 0 }, vips[2]]).alignment).toBeNull()
  expect(calculateRoadVertical(vips.map(p => ({ ...p, reducedLevel: NaN }))).alignment).toBeNull()
  expect(calculateRoadVertical(vips.map(p => p.id === 'pvi' ? { ...p, curveLength: 250 } : p)).alignment).toBeNull()
  const overlapping = [{ id: 'a', chainage: 0, reducedLevel: 0 }, { id: 'b', chainage: 100, reducedLevel: 2, curveLength: 150 }, { id: 'c', chainage: 150, reducedLevel: 1, curveLength: 100 }, { id: 'd', chainage: 300, reducedLevel: 3 }]
  expect(calculateRoadVertical(overlapping).alignment).toBeNull()
})
it('evaluates a straight tangent and retains full precision in shallow grade changes', () => {
  expect(roadVerticalStation(required(calculateRoadVertical([vips[0], { ...vips[1], curveLength: undefined }]).alignment), 25)?.elevation).toBe(0.5)
  const shallow = [{ id: 'a', chainage: 0, reducedLevel: 0 }, { id: 'b', chainage: 1000, reducedLevel: 12.3456789, curveLength: 200 }, { id: 'c', chainage: 2000, reducedLevel: 24.6891234 }]
  const alignment = required(calculateRoadVertical(shallow).alignment)
  const g1 = 1.23456789, g2 = 1.23434445
  expect(roadVerticalStation(alignment, 1000)?.elevation).toBeCloseTo(12.3456789 + (g2 - g1) * 200 / 800, 12)
})
it('uses evaluated levels only for explicitly linked stations and preserves manual target levels', () => {
  const road = { vips, stations: [{ chainage: 100, groundLevel: 3, designLevelSource: 'vertical-alignment' }, { chainage: 150, groundLevel: 3, designLevel: 0 }] } as RoadDesignData
  expect(resolveRoadDesignStations(road).stations.map(s => s.designLevel)).toEqual([1.5, 0])
  expect(resolveRoadDesignStations({ ...road, vips: [] }).issues.length).toBeGreaterThan(0)
})
it('samples an explicitly requested interval and all curve/end critical points without extrapolation', () => {
  const road = { vips, stations: [], verticalStationIntervalM: 30 } as unknown as RoadDesignData
  const result = buildRoadVerticalSchedules(road)
  expect(result.issues).toEqual([])
  expect(result.stations.map(s => s.chainage)).toEqual([0,30,50,60,90,100,120,150,180,200])
  expect(result.stations.find(s => s.chainage === 100)?.elevation).toBe(1.5)
  expect(buildRoadVerticalSchedules({ ...road, verticalStationIntervalM: 0 }).stations).toEqual([])
  expect(buildRoadVerticalSchedules({ ...road, verticalStationIntervalM: 0.0001 }).stations).toEqual([])
})
