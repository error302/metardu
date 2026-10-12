import { distanceBearingSolvedFromCoords } from '@/lib/engine/solution/wrappers/distance'

test('coincident points cannot produce an invented bearing', () => {
  expect(() => distanceBearingSolvedFromCoords({e1:500000,n1:9900000,e2:500000,n2:9900000}))
    .toThrow(/bearing is undefined/i)
})

test.each([NaN, Infinity, -Infinity])('non-finite coordinate %s is rejected', value => {
  expect(() => distanceBearingSolvedFromCoords({e1:value,n1:0,e2:10,n2:20})).toThrow(/finite/i)
})

test('independent setting-out fixture keeps full numerical precision', () => {
  const {result} = distanceBearingSolvedFromCoords({e1:500000,n1:9900000,e2:500010,n2:9900020})
  expect(result.distance).toBeCloseTo(Math.sqrt(500),10)
  expect(result.bearing).toBeCloseTo(26.56505117707799,10)
})
