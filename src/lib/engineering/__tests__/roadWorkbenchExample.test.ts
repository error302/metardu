import { roadWorkbenchExample } from '../roadWorkbenchExample'
import { buildRoadWorkbenchModel } from '../roadWorkbench'
it('provides an explicitly synthetic worked road through the actual route, profile and section engines', () => {
  const { road, reference } = roadWorkbenchExample(),
    model = buildRoadWorkbenchModel(road, reference)
  expect(road.roadName).toMatch(/synthetic/i)
  expect(reference.verticalDatum).toMatch(/synthetic/i)
  expect(model.issues).toEqual([])
  expect(model.plan.length).toBeGreaterThan(100)
  expect(model.quantity?.result.rows.length).toBe(road.stations.length)
  expect(model.plan.at(-1)).toMatchObject({
    easting: 500120,
    northing: 9500120,
  })
  expect(model.profile.length).toBeGreaterThan(100)
})
