import { verticalCurve } from '../curves'

describe('legacy BVC-anchored vertical profile integrity', () => {
  it('uses percent grades and includes the unique crest station', () => {
    const rows = verticalCurve(2, -2, 200, 100, 60)
    expect(rows.map(row => row.chainage)).toEqual([0, 60, 100, 120, 180, 200])
    expect(rows.find(row => row.chainage === 100)).toEqual({ chainage: 100, rl: 101, cutFill: -1 })
    expect(rows.at(-1)).toEqual({ chainage: 200, rl: 100, cutFill: -4 })
  })

  it('retains a sag station between regular pegs and the exact off-interval endpoint', () => {
    const rows = verticalCurve(-2, 4, 205, 100, 80)
    expect(rows).toHaveLength(5)
    expect(rows.map(row => row.chainage)).toEqual([0, 80, 205 / 3, 160, 205].sort((a, b) => a - b))
    const sag = rows[1]
    expect(sag.rl).toBeCloseTo(100 - 205 / 300, 12)
    expect(rows.at(-1)?.rl).toBeCloseTo(102.05, 12)
  })

  it('does not insert a fictitious stationary point on a monotone profile', () => {
    expect(verticalCurve(2, 6, 200, 0, 70).map(row => row.chainage)).toEqual([0, 70, 140, 200])
  })

  it('deduplicates a stationary point that is also a regular peg', () => {
    const stations = verticalCurve(2, -2, 200, 0, 20).map(row => row.chainage)
    expect(stations.filter(station => station === 100)).toHaveLength(1)
    expect(new Set(stations).size).toBe(stations.length)
  })

  it.each([0, -10, 1e-16])('preserves the supplied start RL %s exactly', start => {
    const rows = verticalCurve(2, -2, 200, start, 80)
    expect(rows[0].rl).toBe(start)
    expect(rows.find(row => row.chainage === 100)?.rl).toBe(start + 1)
    expect(rows.at(-1)?.rl).toBe(start)
  })

  it('supports equal grades as a straight profile without invented cut/fill', () => {
    expect(verticalCurve(2, 2, 50, -1, 100)).toEqual([
      { chainage: 0, rl: -1, cutFill: 0 }, { chainage: 50, rl: 0, cutFill: 0 },
    ])
  })

  it('allows a large finite level for a truly flat profile', () => {
    expect(verticalCurve(0, 0, 50, 1e30, 100).map(row => row.rl)).toEqual([1e30, 1e30])
  })

  it('keeps the historical ten-metre default sampling interval', () => {
    expect(verticalCurve(1, 1, 25, 0).map(row => row.chainage)).toEqual([0, 10, 20, 25])
  })

  // These formerly unbounded inputs are exercised only after the bounded
  // shared-engine adapter is installed, so the red run cannot exhaust memory.
  it.each([0, Infinity, Number.MIN_VALUE, 0.0001])('bounds unsafe sampling interval %s', interval => {
    expect(() => verticalCurve(2, -2, 200, 0, interval)).toThrow()
  })

  it.each([Infinity, Number.MIN_VALUE, Number.MAX_VALUE])('refuses unsafe length %s', length => {
    expect(() => verticalCurve(2, -2, length, 0)).toThrow()
  })

  it('refuses translated overflow', () => {
    expect(() => verticalCurve(1e305, 1e305, 1000, Number.MAX_VALUE, 100)).toThrow(/range/i)
  })

  it.each([
    [NaN, 2, 100, 0, 20], [1, Infinity, 100, 0, 20],
    [1, 2, NaN, 0, 20], [1, 2, 0, 0, 20], [1, 2, -1, 0, 20],
    [1, 2, 100, NaN, 20], [1, 2, 100, Infinity, 20],
    [1, 2, 100, 0, NaN], [1, 2, 100, 0, -20],
    [-Number.MAX_VALUE, Number.MAX_VALUE, 100, 0, 20],
    [2, -2, 200, 1e30, 20],
  ])('refuses invalid or unresolvable geometry %j', (g1, g2, length, start, interval) => {
    expect(() => verticalCurve(g1, g2, length, start, interval)).toThrow()
  })
})
