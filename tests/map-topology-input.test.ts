import { mapTopologyVertices } from '@/lib/survey/mapTopologyInput'
import { transformPoint } from '@/lib/spatial/projectCrs'

const arcZone37 = 'EPSG:' + 21037
const wgsZone36 = 'EPSG:' + 32736
test.each([arcZone37, wgsZone36])('display geometry enters topology in %s with grid coordinates and closure preserved', crs => {
  const grid = [[500000, 9800000], [500010, 9800000], [500010, 9800010], [500000, 9800000]]
  const display = grid.map(([e, n]) => transformPoint(e, n, crs, 'EPSG:3857'))
  const restored = mapTopologyVertices(display, 'EPSG:3857', crs)
  restored.forEach((point, index) => {
    expect(point.easting).toBeCloseTo(grid[index][0], 2)
    expect(point.northing).toBeCloseTo(grid[index][1], 2)
  })
  expect(restored[0]).toEqual(restored[3])
})
test('missing, display-only, geographic and invalid coordinates cannot produce survey topology input', () => {
  for (const crs of [null, 'EPSG:3857', 'EPSG:4326']) expect(() => mapTopologyVertices([[0, 0]], 'EPSG:3857', crs)).toThrow()
  expect(() => mapTopologyVertices([[Infinity, 0]], 'EPSG:3857', arcZone37)).toThrow('Invalid')
})
