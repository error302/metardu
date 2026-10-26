import { buildRoadWorkbenchModel } from '../roadWorkbench'
import {
  buildRoadWorkbenchScene,
  roadWorkbenchLineSegments,
} from '../roadWorkbenchScene'
import type { RoadDesignData } from '@/types/engineering'
const ref = {
  code: 'EPSG:32737',
  verticalDatum: 'SYNTHETIC BM',
  distanceMode: 'grid' as const,
}
function road(): RoadDesignData {
  return {
    roadName: 'SYNTHETIC cambered road',
    datum: 'Declared',
    coordinateSystem: ref.code,
    designSpeed: 40,
    roadClass: 'C',
    startChainage: 0,
    ips: [
      { id: 'a', name: 'A', easting: 500000, northing: 9500000, radius: 0 },
      { id: 'b', name: 'B', easting: 500000, northing: 9500020, radius: 0 },
    ],
    vips: [
      { id: 'v1', chainage: 0, reducedLevel: 0 },
      { id: 'v2', chainage: 20, reducedLevel: 0 },
    ],
    stations: [],
    crossSectionTemplate: {
      carriagewayWidth: 6,
      shoulderWidth: 1,
      camber: 2,
      shoulderCrossfall: 4,
      subgradeDepth: 0.5,
      cutSlope: '1:1',
      fillSlope: '1:1',
    },
  }
}
it('renders crown, carriageway edges and shoulders rather than flattening the 3D camber', () => {
  const scene = buildRoadWorkbenchScene(buildRoadWorkbenchModel(road(), ref))
  expect(scene.deck.length).toBeGreaterThan(0)
  const levels = scene.deck.map((p) => p.elevation)
  expect(levels).toContain(-0.5)
  expect(levels.some((z) => Math.abs(z + 0.56) < 1e-12)).toBe(true)
  expect(levels.some((z) => Math.abs(z + 0.6) < 1e-12)).toBe(true)
  expect(scene.groundPaths).toEqual([])
  expect(
    scene.deck.every((p) =>
      [p.easting, p.northing, p.elevation].every(Number.isFinite),
    ),
  ).toBe(true)
})
it('does not turn missing height references or unknown targets into zero-height 3D geometry', () => {
  const input = road()
  input.vips = []
  expect(
    buildRoadWorkbenchScene(buildRoadWorkbenchModel(input, ref)).deck,
  ).toEqual([])
  expect(
    buildRoadWorkbenchScene(
      buildRoadWorkbenchModel(road(), { ...ref, verticalDatum: null }),
    ).deck,
  ).toEqual([])
})
it('does not bridge a missing manual target in the displayed formation ribbon', () => {
  const input = road()
  input.stations = [
    { chainage: 10, groundLevel: 0, designLevelSource: 'manual' },
  ]
  const scene = buildRoadWorkbenchScene(buildRoadWorkbenchModel(input, ref))
  for (let i = 0; i < scene.deck.length; i += 3) {
    const n = scene.deck.slice(i, i + 3).map((p) => p.northing)
    expect(Math.min(...n) < 9500010 && Math.max(...n) > 9500010).toBe(false)
  }
  expect(scene.deck.some((p) => p.northing === 9500010)).toBe(false)
})
it('batches independent measured sections without connecting their ends or losing local-coordinate precision', () => {
  const origin = { easting: 500000, northing: 9500000, elevation: 100 }
  const segments = roadWorkbenchLineSegments(
    [
      [origin, { easting: 500002, northing: 9500001, elevation: 100.5 }],
      [
        { easting: 500010, northing: 9500000, elevation: 100 },
        { easting: 500012, northing: 9500001, elevation: 100.5 },
      ],
    ],
    origin,
  )
  expect(Array.from(segments)).toEqual([
    0, 0, 0, 2, 0.5, -1, 10, 0, 0, 12, 0.5, -1,
  ])
})
