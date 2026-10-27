/** @jest-environment node */
import { assessRoadCorridorOverlap } from '../roadCorridorOverlap'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import type { RoadDesignData } from '@/types/engineering'
const { reference } = roadWorkbenchExample()
function route(points: number[][], radius = 20, transition = false): RoadDesignData {
  return { ...roadWorkbenchExample().road, startChainage: 0, ips: points.map(([x, y], i) => ({ id: `ip-${i}`, name: `IP ${i}`, easting: 500000 + x, northing: 9500000 + y, radius: i > 0 && i < points.length - 1 ? radius : 0,
    ...(transition && i > 0 && i < points.length - 1 ? { hasTransition: true, transitionLengthIn: 5, transitionLengthOut: 5 } : {}) })) }
}
it('clears a complete straight strip without discretizing it into station samples', async () => {
  const road = route([[0, 0], [0, 100000]]), before = JSON.stringify(road)
  expect(await assessRoadCorridorOverlap(road, reference, 20)).toMatchObject({ status: 'clear', fieldVerified: false, start: 0, end: 100000 })
  expect(JSON.stringify(road)).toBe(before)
})
it.each([false, true])('clears a single fitted bend (transition=%s)', async transition => {
  const road = route([[0, 0], [200, 0], [200, 200]], 40, transition)
  expect(await assessRoadCorridorOverlap(road, reference, 20)).toMatchObject({ status: 'clear' })
})
it.each([false, true])('handles separated alternating turns without treating adjacent strips as overlaps (transition=%s)', async transition => {
  const road = route([[0, 0], [200, 0], [200, 200], [400, 200], [400, 400]], 40, transition)
  expect(await assessRoadCorridorOverlap(road, reference, 10)).toMatchObject({ status: 'clear' })
})
it.each([false, true])('withholds a globally crossing strip despite valid local curvature (transition=%s)', async transition => {
  const road = route([[0, 0], [200, 200], [0, 200], [200, 0]], 20, transition)
  const result = await assessRoadCorridorOverlap(road, reference, 10)
  expect(result.status).toBe('unassessed')
  expect(result.reason).toMatch(/overlap|separation|enclosure/i)
})
it('withholds close returning parallel strips even when the centrelines do not cross', async () => {
  const road = route([[0, 0], [200, 0], [200, 200], [-100, 200], [-100, 20], [30, 20]], 20)
  expect((await assessRoadCorridorOverlap(road, reference, 15)).status).toBe('unassessed')
})
it('can clear returning parallel strips with a positive gap', async () => {
  const road = route([[0, 0], [200, 0], [200, 200], [-100, 200], [-100, 30.1], [30, 30.1]], 20)
  expect(await assessRoadCorridorOverlap(road, reference, 15)).toMatchObject({ status: 'clear' })
})
it('does not round exact strip contact into a positive clearance', async () => {
  const road = route([[0, 0], [200, 0], [200, 200], [-100, 200], [-100, 30], [30, 30]], 20)
  expect((await assessRoadCorridorOverlap(road, reference, 15)).status).toBe('unassessed')
})
it('clears a well-separated U route even though its accumulated turn reaches pi',async()=>{
  expect(await assessRoadCorridorOverlap(route([[0,0],[200,0],[200,200],[0,200]],40),reference,20)).toMatchObject({status:'clear'})
})
it('withholds a loop that returns onto its own initial corridor',async()=>{
  expect((await assessRoadCorridorOverlap(route([[0,0],[200,0],[200,200],[0,200],[0,0],[100,0]],20),reference,10)).status).toBe('unassessed')
})
it('reviews a 200-IP separated work package within its geometry limits',async()=>{
  const points=Array.from({length:200},(_,i)=>[i*100,i%2?10:0])
  expect(await assessRoadCorridorOverlap(route(points,40),reference,10)).toMatchObject({status:'clear'})
},20000)
it.each([20, 21, 500])('refuses a locally folded or singular review width %s', async width => {
  const road = route([[0, 0], [200, 0], [200, 200]], 20)
  const result = await assessRoadCorridorOverlap(road, reference, width)
  expect(result.status).toBe('unassessed')
  expect(result.reason).toMatch(/fold|singular|radius/i)
})
it.each([0, -1, NaN, Infinity, 501])('refuses invalid half-width %s', async width => {
  expect((await assessRoadCorridorOverlap(route([[0, 0], [200, 0]]), reference, width)).status).toBe('unassessed')
})
it('requires the current declared grid/height reference', async () => {
  const road = route([[0, 0], [200, 0]])
  for (const ref of [{ ...reference, distanceMode: 'ground' as const }, { ...reference, verticalDatum: '' }, { ...reference, code: null }]) {
    expect((await assessRoadCorridorOverlap(road, ref, 10)).status).toBe('unassessed')
  }
})
it('honors cancellation without presenting a cleared corridor verdict', async () => {
  const controller = new AbortController()
  const pending = assessRoadCorridorOverlap(route([[0, 0], [200, 0], [200, 200], [400, 200]], 40), reference, 10, controller.signal)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})
it.each([0, 37, 90, 180])('is unchanged by rotation/translation at %s degrees', async angle => {
  const road = route([[0, 0], [200, 0], [200, 200], [400, 200]], 40), theta = angle * Math.PI / 180
  road.ips = road.ips.map(p => { const x = p.easting - 500000, y = p.northing - 9500000; return { ...p, easting: 500000 + x * Math.cos(theta) - y * Math.sin(theta), northing: 9500000 + x * Math.sin(theta) + y * Math.cos(theta) } })
  expect(await assessRoadCorridorOverlap(road, reference, 10)).toMatchObject({ status: 'clear' })
})
