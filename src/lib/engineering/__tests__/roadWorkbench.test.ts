import { buildRoadWorkbenchModel, roadWorkbenchSection } from '../roadWorkbench'
import type { RoadDesignData } from '@/types/engineering'
const otherFixtureCrs = 'EPSG:21037'
const reference = {
  code: 'EPSG:32737',
  verticalDatum: 'SYNTHETIC BM',
  distanceMode: 'grid' as const,
}
const workbenchRoad = (): RoadDesignData => ({
  roadName: 'SYNTHETIC road',
  startChainage: 0,
  datum: 'Declared',
  coordinateSystem: reference.code,
  designSpeed: 40,
  roadClass: 'C',
  ips: [
    { id: 'a', name: 'Start', easting: 500000, northing: 9500000, radius: 0 },
    { id: 'b', name: 'End', easting: 500000, northing: 9500020, radius: 0 },
  ],
  vips: [
    { id: 'v1', chainage: 0, reducedLevel: -1 },
    { id: 'v2', chainage: 20, reducedLevel: -1 },
  ],
  crossSectionTemplate: {
    carriagewayWidth: 6,
    shoulderWidth: 0,
    camber: 0,
    subgradeDepth: 0,
    cutSlope: '1:1',
    fillSlope: '1:1',
  },
  stations: [0, 20].map((chainage) => ({
    chainage,
    groundLevel: 0,
    designLevelSource: 'vertical-alignment',
    groundProfile: [
      { offset: -10, level: 0 },
      { offset: 0, level: 0 },
      { offset: 10, level: 0 },
    ],
  })),
})
it('coordinates one route, actual measured sections and the independently known 140 m3 cut', () => {
  const model = buildRoadWorkbenchModel(workbenchRoad(), reference)
  expect(model.plan[0]).toMatchObject({
    chainage: 0,
    easting: 500000,
    northing: 9500000,
  })
  expect(model.plan.at(-1)).toMatchObject({
    chainage: 20,
    easting: 500000,
    northing: 9500020,
  })
  expect(model.quantity?.result.totalCut).toBe(140)
  const section = roadWorkbenchSection(model, 0)
  expect(section.position).toMatchObject({
    easting: 500000,
    northing: 9500000,
    bearing: 0,
  })
  expect(section.measured).toBe(true)
  expect(section.cutArea).toBe(7)
  expect(section.formation.find((p) => p.offset === 3)).toMatchObject({
    level: -1,
  })
  expect(section.worldFormation.find((p) => p.offset === 3)).toMatchObject({
    easting: 500003,
    northing: 9500000,
    elevation: -1,
  })
})
it('does not invent ground at an unobserved station while showing evaluated design levels', () => {
  const model = buildRoadWorkbenchModel(workbenchRoad(), reference),
    section = roadWorkbenchSection(model, 10)
  expect(section.position).toMatchObject({ northing: 9500010 })
  expect(section.target).toBe(-1)
  expect(section.measured).toBe(false)
  expect(section.ground).toEqual([])
  expect(section.cutArea).toBeNull()
  expect(section.fillArea).toBeNull()
  expect(section.worldGround).toEqual([])
  expect(section.formation.length).toBeGreaterThan(0)
})
it('preserves unknown manual targets and valid zero levels without substituting a vertical target', () => {
  const road = workbenchRoad()
  road.stations[0] = {
    ...road.stations[0],
    designLevelSource: 'manual',
    designLevel: undefined,
  }
  const unknown = roadWorkbenchSection(
    buildRoadWorkbenchModel(road, reference),
    0,
  )
  expect(unknown.target).toBeNull()
  expect(unknown.formation).toEqual([])
  expect(unknown.worldFormation).toEqual([])
  road.stations[0].designLevel = 0
  expect(
    roadWorkbenchSection(buildRoadWorkbenchModel(road, reference), 0).target,
  ).toBe(0)
})
it('reuses circular route geometry instead of drawing straight through the PI', () => {
  const road = workbenchRoad()
  road.ips = [
    { id: 'a', name: 'A', easting: 0, northing: 0, radius: 0 },
    { id: 'p', name: 'PI', easting: 100, northing: 0, radius: 20 },
    { id: 'b', name: 'B', easting: 100, northing: 100, radius: 0 },
  ]
  road.stations = []
  road.vips = []
  const model = buildRoadWorkbenchModel(road, reference),
    s = roadWorkbenchSection(model, 80 + 5 * Math.PI)
  expect(s.position?.easting).toBeCloseTo(80 + 20 / Math.sqrt(2), 9)
  expect(s.position?.northing).toBeCloseTo(20 - 20 / Math.sqrt(2), 9)
  expect(s.position?.bearing).toBeCloseTo(45, 9)
  expect(
    roadWorkbenchSection(model, (model.end ?? Number.NaN) + 1).position,
  ).toBeNull()
})
it('refuses incompatible references and omits 3D/quantities when the height reference is undeclared', () => {
  const mismatch = buildRoadWorkbenchModel(workbenchRoad(), {
    ...reference,
    code: otherFixtureCrs,
  })
  expect(mismatch.plan).toEqual([])
  expect(mismatch.quantity).toBeNull()
  expect(mismatch.issues.join(' ')).toMatch(/match/i)
  const noHeight = buildRoadWorkbenchModel(workbenchRoad(), {
    ...reference,
    verticalDatum: null,
  })
  expect(noHeight.plan.length).toBeGreaterThan(1)
  expect(roadWorkbenchSection(noHeight, 0).worldFormation).toEqual([])
  expect(noHeight.quantity).toBeNull()
  expect(roadWorkbenchSection(noHeight, 0).cutArea).toBeNull()
})
it('recomputes every representation and source identity after an edited vertical design', () => {
  const road = workbenchRoad(),
    a = buildRoadWorkbenchModel(road, reference)
  road.vips = road.vips.map((v) => ({ ...v, reducedLevel: -2 }))
  const b = buildRoadWorkbenchModel(road, reference)
  expect(a.sourceKey).not.toBe(b.sourceKey)
  expect(roadWorkbenchSection(b, 0).target).toBe(-2)
  expect(b.quantity?.result.totalCut).toBe(320)
  expect(b.profile[0].elevation).toBe(-2)
})
it('retains missing ground as unassessed and ignores cached numerical results', () => {
  const road = workbenchRoad()
  road.earthworksTable = [
    {
      chainage: 0,
      cutArea: 999,
      fillArea: 999,
      cutVolume: 999,
      fillVolume: 999,
      cumulativeCut: 999,
      cumulativeFill: 999,
    },
  ]
  expect(
    buildRoadWorkbenchModel(road, reference).quantity?.result.totalCut,
  ).toBe(140)
  road.stations[0].groundProfile = undefined
  const model = buildRoadWorkbenchModel(road, reference)
  expect(model.quantity).toBeNull()
  expect(roadWorkbenchSection(model, 0).cutArea).toBeNull()
  expect(roadWorkbenchSection(model, 0).ground).toEqual([])
})
it('requires an explicitly reduced grid basis instead of treating ground dimensions as grid coordinates', () => {
  const model = buildRoadWorkbenchModel(workbenchRoad(), {
    ...reference,
    distanceMode: 'ground',
  })
  expect(model.plan).toHaveLength(0)
  expect(model.quantity).toBeNull()
  expect(model.issues.join(' ')).toMatch(/grid|reduc/i)
})
