/** @jest-environment node */
import type { RoadDesignData } from '@/types/engineering'
import type { RoadTerrainData } from '../roadTerrain'
import type { QuantityReference } from '../roadQuantity'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import { buildRoadHorizontalGeometry } from '../roadCoordinateSetout'
import { prepareRoadTerrainSectionSampler } from '../roadTerrainSectionSweep'
async function prepare(road: RoadDesignData, reference: QuantityReference, terrain: RoadTerrainData) {
  return prepareRoadTerrainSectionSampler(road, reference, terrain)
}
function fixture() {
  const { road, reference } = roadWorkbenchExample()
  const identity: RoadTerrainData['identity'] = { projectId: '10000000-0000-4000-8000-000000000001', surfaceId: '10000000-0000-4000-8000-000000000002', revisionId: '10000000-0000-4000-8000-000000000003', revision: 1, name: 'Synthetic rate terrain', inputHash: 'a'.repeat(64), meshHash: 'b'.repeat(64), referenceHash: 'c'.repeat(64), crs: reference.code, verticalDatum: reference.verticalDatum, fieldVerified: false }
  const terrain: RoadTerrainData = { identity, mesh: { points: [{ x: 499900, y: 9499900, z: 0 }, { x: 500400, y: 9499900, z: 0 }, { x: 500400, y: 9500400, z: 0 }, { x: 499900, y: 9500400, z: 0 }], triangles: [{ a: 0, b: 1, c: 2 }, { a: 0, b: 2, c: 3 }] } }
  road.retainedTerrain = { ...identity, intervalM: 20, halfWidthM: 20 }
  road.vips = [{ id: 'start-v', chainage: 0, reducedLevel: -1 }, { id: 'end-v', chainage: 1000, reducedLevel: -1 }]
  road.crossSectionTemplate = { carriagewayWidth: 6, shoulderWidth: 0, camber: 0, subgradeDepth: 0, cutSlope: '1:1', fillSlope: '1:1' }
  return { road, reference, terrain }
}
it('combines an exact retained transect, daylight and signed curve weighting without creating a volume total', async () => {
  const { road, reference, terrain } = fixture(), before = JSON.stringify({ road, reference, terrain })
  const sampler = await prepare(road, reference, terrain), result = sampler.at(100, 'after')
  expect(result).toMatchObject({ status: 'LOCAL_REVIEW', fieldVerified: false, cutArea: 7, leftDaylightOffset: -4, rightDaylightOffset: 4 })
  expect(result.cutRateM2).toBeCloseTo(7, 12)
  expect(result.cutMomentM3).toBeCloseTo(0, 12)
  expect(result.curvaturePerM).not.toBe(0)
  expect(result).not.toHaveProperty('totalCut')
  expect(JSON.stringify({ road, reference, terrain })).toBe(before)
})
it('retains prepared input identity and values after caller inputs are edited', async () => {
  const { road, reference, terrain } = fixture(), sampler = await prepare(road, reference, terrain)
  const before = sampler.at(100, 'after'), key = sampler.sourceKey
  road.vips[0].reducedLevel = -20
  if (!road.crossSectionTemplate) throw Error('The synthetic template is absent.')
  road.crossSectionTemplate.carriagewayWidth = 8
  terrain.mesh.points[0].z = 20
  expect(sampler.at(100, 'after')).toEqual(before)
  expect(sampler.sourceKey).toBe(key)
  expect((await prepare(road, reference, terrain)).sourceKey).not.toBe(key)
})
it.each(['revisionId', 'meshHash', 'referenceHash', 'projectId', 'verticalDatum'])('refuses changed terrain identity %s', async key => {
  const { road, reference, terrain } = fixture()
  if (key === 'revisionId' || key === 'projectId') terrain.identity[key] = '10000000-0000-4000-8000-000000000009'
  else if (key === 'verticalDatum') terrain.identity.verticalDatum = 'Other height basis'
  else if (key === 'meshHash' || key === 'referenceHash') terrain.identity[key] = 'd'.repeat(64)
  await expect(prepare(road, reference, terrain)).rejects.toThrow(/identity|reference|revision/i)
})
it('requires an explicit saved binding and complete vertical coverage', async () => {
  const { road, reference, terrain } = fixture()
  delete road.retainedTerrain
  await expect(prepare(road, reference, terrain)).rejects.toThrow(/terrain|binding/i)
  road.retainedTerrain = { ...terrain.identity, intervalM: 20, halfWidthM: 20 }
  road.vips[1].chainage = 10
  await expect(prepare(road, reference, terrain)).rejects.toThrow(/vertical|cover/i)
})
it('does not extrapolate outside the route or beyond available daylight', async () => {
  const { road, reference, terrain } = fixture(), sampler = await prepare(road, reference, terrain)
  expect(() => sampler.at(-1, 'after')).toThrow(/outside|coverage/i)
  expect(() => sampler.at(sampler.end, 'after')).toThrow(/outside|derivative/i)
  road.vips.forEach(v => { v.reducedLevel = -50 })
  const deep = await prepare(road, reference, terrain)
  expect(() => deep.at(100, 'after')).toThrow(/daylight|extend/i)
})
it('refuses a folded circular formation instead of applying an absolute Jacobian', async () => {
  const { road, reference, terrain } = fixture()
  road.ips[1] = { ...road.ips[1], hasTransition: false, transitionLengthIn: undefined, transitionLengthOut: undefined, radius: 2 }
  const geometry = buildRoadHorizontalGeometry(road.ips, road.startChainage, reference.code).alignment
  if (!geometry) throw Error('The folded synthetic curve must have valid centreline geometry.')
  const curve = geometry.segments.find(s => s.kind === 'circular')
  if (!curve) throw Error('The folded synthetic circular segment is absent.')
  const sampler = await prepare(road, reference, terrain)
  expect(() => sampler.at((curve.start + curve.end) / 2, 'after')).toThrow(/fold|singular/i)
})
