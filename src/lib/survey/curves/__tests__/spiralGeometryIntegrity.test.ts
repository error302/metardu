import { defined } from '@/test-utils/defined'
import { computeSpiralAlignment, stationAtDistance, stationSpiralAlignment } from '../spiralAlignment'

// Independent Simpson integration of the defining heading/curvature law, not
// the implementation's series or circle-coordinate construction.
function referenceDisplacement(distance: number, radius: number, length: number, delta: number, bearing: number, turn: number) {
  const total = length + radius * delta, circularEnd = total - length
  const bounds = [0, length, circularEnd, total].filter(value => value <= distance)
  if (bounds.at(-1) !== distance) bounds.push(distance)
  let easting = 0, northing = 0
  for (let j = 1; j < bounds.length; j++) {
    const start = bounds[j - 1], end = bounds[j], n = 2048, h = (end - start) / n
    for (let i = 0; i <= n; i++) {
      const s = start + i * h
      const angle = length === 0 ? s / radius : s <= length ? s * s / (2 * radius * length)
        : s <= circularEnd ? length / (2 * radius) + (s - length) / radius
          : delta - (total - s) ** 2 / (2 * radius * length)
      const weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2
      easting += h / 3 * weight * Math.sin(bearing + turn * angle)
      northing += h / 3 * weight * Math.cos(bearing + turn * angle)
    }
  }
  return { easting, northing }
}

it.each([1, -1])('matches independent integrated coordinates through both transitions, turn %s', turn => {
  const alignment = computeSpiralAlignment({ radius: 300, spiralLength: 60, intersectionAngleDeg: turn * 70, piChainage: 1000, piEasting: 500000, piNorthing: 9900000, approachBearingDeg: 23 })
  const origin = defined(alignment.tsCoord)
  for (const distance of [0, 30, 60, 60 + alignment.Lc / 2, 60 + alignment.Lc, alignment.totalLength - 10, alignment.totalLength]) {
    const actual = defined(stationAtDistance(alignment, distance))
    const expected = referenceDisplacement(distance, 300, 60, 70 * Math.PI / 180, 23 * Math.PI / 180, turn)
    expect(actual.easting).toBeCloseTo(origin.easting + expected.easting, 7)
    expect(actual.northing).toBeCloseTo(origin.northing + expected.northing, 7)
    expect(actual.deflectionDeg * turn).toBeGreaterThanOrEqual(0)
  }
  for (const [distance, coordinate] of [[60, alignment.scCoord], [60 + alignment.Lc, alignment.csCoord], [alignment.totalLength, alignment.stCoord]] as const) {
    const actual = defined(stationAtDistance(alignment, distance))
    expect(actual.easting).toBeCloseTo(defined(coordinate).easting, 7)
    expect(actual.northing).toBeCloseTo(defined(coordinate).northing, 7)
  }
})

it('retains a finite pure circular alignment when spiral length is zero', () => {
  const a = computeSpiralAlignment({ radius: 100, spiralLength: 0, intersectionAngleDeg: -60, piChainage: 0 })
  const last = defined(stationAtDistance(a, a.totalLength))
  expect(Number.isFinite(last.easting) && Number.isFinite(last.northing)).toBe(true)
  expect(last.easting).toBeCloseTo(100 * Math.sin(Math.PI / 3), 8)
  expect(last.northing).toBeCloseTo(-100 * (1 - Math.cos(Math.PI / 3)), 8)
})

it.each([
  { radius: NaN }, { radius: Infinity }, { spiralLength: NaN }, { intersectionAngleDeg: 180 },
  { intersectionAngleDeg: NaN }, { piChainage: Infinity }, { approachBearingDeg: NaN }, { piEasting: 0 },
])('rejects incomplete or nonfinite geometry: %j', override => {
  expect(() => computeSpiralAlignment({ radius: 300, spiralLength: 60, intersectionAngleDeg: 70, piChainage: 1000, ...override })).toThrow()
})

it('rejects invalid sample spacing and out-of-range station requests', () => {
  const a = computeSpiralAlignment({ radius: 300, spiralLength: 60, intersectionAngleDeg: 70, piChainage: 1000 })
  expect(() => stationSpiralAlignment(a, NaN)).toThrow()
  for (const interval of [0, -1, Infinity, 1e-20]) expect(() => stationSpiralAlignment(a, interval)).toThrow()
  expect(stationAtDistance(a, NaN)).toBeNull()
  expect(stationAtDistance(a, -0.001)).toBeNull()
})

it('retains exact junctions with an irregular sample interval and accepts zero coordinates', () => {
  const a = computeSpiralAlignment({ radius: 300, spiralLength: 60, intersectionAngleDeg: 70, piChainage: 0, piEasting: 0, piNorthing: 0 })
  const distances = stationSpiralAlignment(a, 17).map(station => station.distanceFromTS)
  expect(distances).toEqual(expect.arrayContaining([0, 60, 60 + a.Lc, a.totalLength]))
  expect(distances.every((distance, i) => i === 0 || distance > distances[i - 1])).toBe(true)
})
