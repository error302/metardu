import { analyzePipelineAsBuilt, type PipelinePoint } from '../p2Modules'

const point = (overrides: Record<string, unknown> = {}): PipelinePoint => ({
  id: 'OBS1', chainage: 0, invertElevation: 10, groundElevation: 11,
  pipeDiameter: 300, outsideDiameter: 400, ...overrides,
} as PipelinePoint)
const criterion = { minimumCoverM: 0.4, source: 'Synthetic issued drawing P1', revision: 'R1' }
test('cover uses the outside crown above an internal invert and retains exposed pipe depth', () => {
  const result = analyzePipelineAsBuilt([point({ groundElevation: 10.2 })])
  expect(result.points[0]).toMatchObject({ outsideCrownRl: 10.35, coverAdequate: null })
  expect(result.points[0].coverDepth).toBeCloseTo(-0.15, 10)
  expect(result.minCover).toBeCloseTo(-0.15, 10)
})
test('fall is positive downstream and the last observation has no next-segment grade', () => {
  const result = analyzePipelineAsBuilt([point(), point({ id: 'OBS2', chainage: 50, invertElevation: 9.5 })])
  expect(result.points[0].grade).toBe(1)
  expect(result.points[1].grade).toBeNull()
  expect(result.maxGrade).toBe(1)
})
test('missing ground or outside diameter stays unknown rather than becoming zero or a thin-wall assumption', () => {
  const result = analyzePipelineAsBuilt([point({ outsideDiameter: null }), point({ id: 'OBS2', chainage: 10, groundElevation: null })])
  expect(result.points.map(row => row.coverDepth)).toEqual([null, null])
  expect(result.points.map(row => row.coverAdequate)).toEqual([null, null])
  expect(result.minCover).toBeNull()
})
test('zero invert and signed chainage/ground are legitimate measurements', () => {
  const result = analyzePipelineAsBuilt([point({ chainage: -10, invertElevation: 0, groundElevation: 0 })])
  expect(result.points[0].coverDepth).toBeCloseTo(-0.35, 10)
})
test('cover comparisons require an explicitly referenced project criterion', () => {
  const without = analyzePipelineAsBuilt([point()])
  expect(without.points[0].coverAdequate).toBeNull()
  const result = analyzePipelineAsBuilt([point(), point({ id: 'OBS2', chainage: 50, groundElevation: 10.5 })], criterion as unknown as Parameters<typeof analyzePipelineAsBuilt>[1])
  expect(result.points.map(row => row.coverAdequate)).toEqual([true, false])
  expect(result.inadequateCoverCount).toBe(1)
})
test.each([
  [], [point(), point({ chainage: 0 })], [point(), point({ chainage: -1 })],
  [point({ invertElevation: NaN })], [point({ pipeDiameter: -1 })],
  [point({ outsideDiameter: 100 })], [point({ groundElevation: Infinity })],
].map(points => [points]))('invalid or unordered survey evidence cannot produce a partial result: %p', points => {
  expect(() => analyzePipelineAsBuilt(points)).toThrow()
})
test('a number without a specification reference cannot act as a universal cover standard', () => {
  expect(() => analyzePipelineAsBuilt([point()], 0.6 as unknown as Parameters<typeof analyzePipelineAsBuilt>[1])).toThrow()
})
test('binary subtraction at the entered minimum cannot cause a false below-minimum result', () => {
  const result = analyzePipelineAsBuilt([point({ invertElevation: 10.05, groundElevation: 11 })], { ...criterion, minimumCoverM: 0.6 })
  expect(result.points[0].coverAdequate).toBe(true)
})
