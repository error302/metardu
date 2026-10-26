import { roadWorkbenchPlot } from '../roadWorkbenchPlot'
it('uses one metre scale for plan axes and reports the actual expanded viewport limits', () => {
  const p = roadWorkbenchPlot(
    [
      [500000, 9500000],
      [500000, 9500020],
    ],
    true,
  )
  const a = p.project([500000, 9500000]),
    e = p.project([500001, 9500000]),
    n = p.project([500000, 9500001])
  expect(Math.abs(e[0] - a[0])).toBeCloseTo(Math.abs(n[1] - a[1]), 12)
  expect(p.project([p.xMin, p.yMin])).toEqual([112, 240])
  expect(p.project([p.xMax, p.yMax])[0]).toBeCloseTo(772, 9)
  expect(p.project([p.xMax, p.yMax])[1]).toBeCloseTo(40, 9)
  expect(a[0]).toBeCloseTo(442, 9)
})
it('keeps profile chainages invertible with declared independent height scaling', () => {
  const p = roadWorkbenchPlot(
    [
      [100, 0],
      [200, 1],
    ],
    false,
  )
  expect(p.project([150, 0.5])).toEqual([442, 140])
  expect(p.chainageAt(442)).toBe(150)
  expect(p.yMin).toBe(0)
  expect(p.yMax).toBe(1)
})
