import { splitPolygonWithLine } from '../ol/editingTools'
import { DISPLAY_CRS } from '@/lib/spatial/projectCrs'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const crs = 'EPSG:32633'
const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]

test('a bent dividing line retains its internal vertices and actual parcel areas', () => {
  const line: [number, number][] = [[50, -10], [50, 25], [75, 25], [75, 75], [50, 75], [50, 110]]
  const result = splitPolygonWithLine(square, line, crs)
  expect(result).not.toBeNull()
  expect([result?.area1, result?.area2].sort()).toEqual([3750, 6250])
  for (const polygon of [result?.polygon1, result?.polygon2]) {
    expect(polygon).toContainEqual([75, 25])
    expect(polygon).toContainEqual([75, 75])
  }
})

test('a cut returning to the same parent edge is not replaced by its exterior endpoint chord', () => {
  const result = splitPolygonWithLine(square, [[40, -10], [40, 50], [60, 50], [60, -10]], crs)
  expect(result).not.toBeNull()
  expect([result?.area1, result?.area2].sort((a, b) => Number(a) - Number(b))).toEqual([1000, 9000])
})

test('a three-face cut cannot silently discard the third parcel', () => {
  const uShape: [number, number][] = [[0, 0], [100, 0], [100, 100], [75, 100], [75, 25], [25, 25], [25, 100], [0, 100], [0, 0]]
  expect(splitPolygonWithLine(uShape, [[-10, 50], [110, 50]], crs)).toBeNull()
})

test('self-crossing cuts and boundary-overlapping cuts do not create accepted parcels', () => {
  expect(splitPolygonWithLine(square, [[0, 50], [80, 80], [20, 80], [80, 20], [20, 20], [100, 50]], crs)).toBeNull()
  expect(splitPolygonWithLine(square, [[0, 0], [100, 0], [100, 50]], crs)).toBeNull()
})

test('exact boundary endpoints and corner-to-corner cuts retain the full area', () => {
  for (const line of [[[0, 0], [100, 100]], [[0, 50], [100, 50]]] as [number, number][][]) {
    const result = splitPolygonWithLine(square, line, crs)
    expect(result).not.toBeNull()
    expect(result?.area1).toBeCloseTo(5000, 7)
    expect(result?.area2).toBeCloseTo(5000, 7)
  }
})

test('a translated bent cut retains original control vertices and leaves its inputs untouched', () => {
  const parent = square.map(([x, y]): [number, number] => [500000 + x, 9900000 + y])
  const line: [number, number][] = [[500050, 9899990], [500050, 9900025], [500075, 9900025], [500075, 9900075], [500050, 9900075], [500050, 9900110]]
  const before = JSON.stringify({ parent, line })
  const result = splitPolygonWithLine(parent, line, crs)
  expect(result).not.toBeNull()
  expect([result?.area1, result?.area2].sort()).toEqual([3750, 6250])
  const vertices = [...(result?.polygon1 ?? []), ...(result?.polygon2 ?? [])]
  for (const corner of parent) expect(vertices).toContainEqual(corner)
  expect(JSON.stringify({ parent, line })).toBe(before)
})

test.each([DISPLAY_CRS, 'EPSG:4326', 'EPSG:999999'])('the splitter refuses non-survey grid %s', invalid => {
  expect(splitPolygonWithLine(square, [[50, -10], [50, 110]], invalid)).toBeNull()
})

test('degenerate or non-finite geometry cannot produce parcel areas', () => {
  expect(splitPolygonWithLine([], [[50, -10], [50, 110]], crs)).toBeNull()
  expect(splitPolygonWithLine(square, [[NaN, -10], [50, 110]], crs)).toBeNull()
  expect(splitPolygonWithLine(square, [[50, 50], [50, 50]], crs)).toBeNull()
})

test('bent-cut areas survive rotation, reversal and grid translation without replacing the drawn path', () => {
  const cut: [number, number][] = [[50, -10], [50, 25], [75, 25], [75, 75], [50, 75], [50, 110]]
  for (const angle of [0, 0.17, 0.63, 1.24, 2.8]) {
    for (const reverse of [false, true]) {
      const convert = ([x, y]: [number, number]): [number, number] => [500000 + x * Math.cos(angle) - y * Math.sin(angle), 6650000 + x * Math.sin(angle) + y * Math.cos(angle)]
      const polygon = square.map(convert)
      const dividingLine = cut.map(convert)
      if (reverse) { polygon.reverse(); dividingLine.reverse() }
      const result = splitPolygonWithLine(polygon, dividingLine, crs)
      expect(result).not.toBeNull()
      const areas = [result?.area1 ?? NaN, result?.area2 ?? NaN].sort((a, b) => a - b)
      expect(areas[0]).toBeCloseTo(3750, 5)
      expect(areas[1]).toBeCloseTo(6250, 5)
      expect(areas[0] + areas[1]).toBeCloseTo(10000, 5)
    }
  }
})
