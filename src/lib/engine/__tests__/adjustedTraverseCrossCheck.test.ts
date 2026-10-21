import { bowditchAdjustment } from '../traverse'
import { crossCheckAdjustedTraverse } from '../calculationCrossCheck'

function result() {
  return bowditchAdjustment({ points: [{ name: 'A', easting: 0, northing: 0 }, { name: 'B', easting: 0, northing: 100 }],
    distances: [100], bearings: [0], closingPoint: { easting: 0, northing: 100 } })
}

test('compares actual adjusted deltas with the actual start-to-end coordinate displacement', () => {
  expect(crossCheckAdjustedTraverse({ easting: 0, northing: 0 }, result())).toMatchObject({ passed: true, difference: 0 })
})

test('detects an endpoint inconsistent with the retained adjusted deltas', () => {
  const adjusted = result()
  adjusted.legs[0].adjEasting = 1
  expect(crossCheckAdjustedTraverse({ easting: 0, northing: 0 }, adjusted)).toMatchObject({ passed: false, difference: 1 })
})

test('missing or non-finite coordinate evidence stays unassessed', () => {
  const adjusted = result()
  expect(crossCheckAdjustedTraverse({ easting: NaN, northing: 0 }, adjusted)).toBeNull()
  expect(crossCheckAdjustedTraverse({ easting: 0, northing: 0 }, { ...adjusted, legs: [] })).toBeNull()
  adjusted.legs[0].adjDeltaE = Infinity
  expect(crossCheckAdjustedTraverse({ easting: 0, northing: 0 }, adjusted)).toBeNull()
})
