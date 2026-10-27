/** @jest-environment node */
import * as horizontal from '../roadCoordinateSetout'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import type { ProjectHorizontalGeometry } from '../roadCoordinateSetout'
type Side = 'before' | 'after'
function curvature(alignment: ProjectHorizontalGeometry, chainage: number, side: Side): number | null {
  return horizontal.roadHorizontalCurvature(alignment, chainage, side)
}
function fixture(transition: boolean, turn: number) {
  const { road, reference } = roadWorkbenchExample()
  const ips = road.ips.map((p, i) => ({ ...p, northing: 9500000 + turn * (p.northing - 9500000), ...(i === 1 ? { hasTransition: transition, transitionLengthIn: transition ? 10 : undefined, transitionLengthOut: transition ? 10 : undefined } : {}) }))
  const built = horizontal.buildRoadHorizontalGeometry(ips, 0, reference.code)
  if (!built.alignment) throw Error(built.issues.join(' '))
  return built.alignment
}
it.each([-1, 1])('reports explicit one-sided circular curvature for turn reflection %s', turn => {
  const alignment = fixture(false, turn), curve = alignment.segments.find(s => s.kind === 'circular')
  if (!curve || curve.kind !== 'circular') throw Error('The circular fixture is absent.')
  const expected = curve.turn / curve.radius
  expect(curvature(alignment, curve.start, 'before')).toBe(0)
  expect(curvature(alignment, curve.start, 'after')).toBe(expected)
  expect(curvature(alignment, curve.end, 'before')).toBe(expected)
  expect(curvature(alignment, curve.end, 'after')).toBe(0)
  expect(curvature(alignment, (curve.start + curve.end) / 2, 'after')).toBe(expected)
})
it.each([-1, 1])('follows linear entry/exit curvature through a transition (reflection %s)', turn => {
  const alignment = fixture(true, turn), curve = alignment.segments.find(s => s.kind === 'spiral-circular-spiral')
  if (!curve || curve.kind !== 'spiral-circular-spiral') throw Error('The transition fixture is absent.')
  const s = curve.spiral, k = Math.sign(s.input.intersectionAngleDeg) / s.input.radius
  for (const side of ['before', 'after'] as const) {
    expect(curvature(alignment, s.tsChainage, side)).toBe(0)
    expect(curvature(alignment, s.scChainage, side)).toBeCloseTo(k, 14)
    expect(curvature(alignment, s.csChainage, side)).toBeCloseTo(k, 14)
    expect(curvature(alignment, s.stChainage, side)).toBe(0)
  }
  expect(curvature(alignment, (s.tsChainage + s.scChainage) / 2, 'after')).toBeCloseTo(k / 2, 14)
  expect(curvature(alignment, (s.csChainage + s.stChainage) / 2, 'before')).toBeCloseTo(k / 2, 14)
})
it('does not invent a derivative outside either endpoint', () => {
  const alignment = fixture(false, 1)
  expect(curvature(alignment, alignment.start, 'before')).toBeNull()
  expect(curvature(alignment, alignment.start, 'after')).toBe(0)
  expect(curvature(alignment, alignment.end, 'before')).toBe(0)
  expect(curvature(alignment, alignment.end, 'after')).toBeNull()
  for (const chainage of [-1, alignment.end + 1, NaN, Infinity]) expect(curvature(alignment, chainage, 'after')).toBeNull()
})
it.each([false, true])('agrees with an independent central heading derivative (transition=%s)', transition => {
  const alignment = fixture(transition, 1)
  for (const segment of alignment.segments) for (const fraction of [0.1, 0.4, 0.8]) {
    const ch = segment.start + fraction * (segment.end - segment.start), delta = 0.001
    const a = horizontal.roadHorizontalStation(alignment, ch - delta), b = horizontal.roadHorizontalStation(alignment, ch + delta)
    if (!a || !b) throw Error('The derivative fixture left the alignment.')
    const headingDifference = ((b.bearing - a.bearing + 540) % 360) - 180
    expect(curvature(alignment, ch, 'after')).toBeCloseTo(headingDifference * Math.PI / 180 / (2 * delta), 8)
  }
})
