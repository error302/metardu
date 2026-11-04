import { buildBreaklineTIN } from '../breaklineTIN'
import { generateTINContours } from '../tinContours'
import { interpolateZ } from '@/lib/survey/surfaceTIN'

const plane = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 10, y: 10, z: 10 }, { x: 0, y: 10, z: 0 }]

test('plane contours follow the TIN and stop at the surveyed hull without a bounding rectangle', () => {
  const tin = buildBreaklineTIN(plane)
  const contours = generateTINContours(tin, { interval: 2, maxVertexSpacing: 3 })
  const line = contours.find(c => c.elevation === 4)
  if (!line) throw new Error('Plane contour at level 4 is missing.')
  expect(line.coordinates).toHaveLength(1)
  expect(line.coordinates[0].every(([x]) => Math.abs(x - 4) < 1e-9)).toBe(true)
  expect(line.coordinates[0].map(p => p[1]).sort((a, b) => a - b)[0]).toBe(0)
  expect(line.coordinates[0].map(p => p[1]).sort((a, b) => b - a)[0]).toBe(10)
  for (const c of contours) for (const path of c.coordinates) for (const [x, y] of path) {
    expect(interpolateZ(tin, x, y)).toBeCloseTo(c.elevation, 8)
  }
})

test('ridge breaklines change contours, which keep both sides of the ridge', () => {
  const base = plane.map(p => ({ ...p, z: 0 }))
  const tin = buildBreaklineTIN(base, [{ type: 'ridge', points: [{ x: 5, y: 0, z: 2 }, { x: 5, y: 10, z: 2 }] }])
  const contours = generateTINContours(tin, { interval: 1 })
  const one = contours.find(c => c.elevation === 1)
  if (!one) throw new Error('Ridge contour at level 1 is missing.')
  expect(one.coordinates).toHaveLength(2)
  expect(one.coordinates.flat().map(p => p[0])).toEqual(expect.arrayContaining([2.5, 7.5]))
  for (const path of one.coordinates) for (const [x, y] of path) expect(interpolateZ(tin, x, y)).toBeCloseTo(1, 9)
})

test('flat plateaus do not become artificial contour polygons', () => {
  expect(generateTINContours(buildBreaklineTIN(plane.map(p => ({ ...p, z: 2 }))), { interval: 1 })).toEqual([])
})

test('closed hill isolines retain a closed chain; measured vertices are joined once', () => {
  const tin = buildBreaklineTIN([...plane.map(p => ({ ...p, z: 0 })), { x: 5, y: 5, z: 2 }])
  const contour = generateTINContours(tin, { interval: 1 }).find(c => c.elevation === 1)
  if (!contour) throw new Error('Hill contour at level 1 is missing.')
  const path = contour.coordinates[0]
  expect(path).toHaveLength(5)
  expect(path[0]).toEqual(path[path.length - 1])
  expect(new Set(path.slice(0, -1).map(p => p.join(':'))).size).toBe(4)
})

test('large projected coordinates and negative decimal elevations remain numerically correct', () => {
  const tin = buildBreaklineTIN(plane.map(p => ({ x: p.x + 500000, y: p.y + 9800000, z: p.z / 10 - 0.5 })))
  const contours = generateTINContours(tin, { interval: 0.1 })
  expect(contours.some(c => c.elevation === -0.3)).toBe(true)
  for (const c of contours) for (const path of c.coordinates) for (const [x, y] of path) {
    expect(interpolateZ(tin, x, y)).toBeCloseTo(c.elevation, 7)
  }
})

test('pathological contour interval and output density fail promptly', () => {
  const tin = buildBreaklineTIN(plane)
  expect(() => generateTINContours(tin, { interval: 0 })).toThrow(/interval/i)
  expect(() => generateTINContours(tin, { interval: 0.00000001 })).toThrow(/limit|levels/i)
  expect(() => generateTINContours(tin, { interval: 2, maxVertexSpacing: 1e-10 })).toThrow(/limit|vertices/i)
})

test('irregular projected observations and a reviewed breakline follow an independent analytic plane',()=>{
 const ox=500000,oy=9850000,height=(x:number,y:number)=>100+0.025*(x-ox)+0.015*(y-oy)
 const xy=[[0,0],[70,0],[100,30],[90,90],[30,110],[0,70],[25,30],[55,40],[50,75],[20,65]]
 const points=xy.map(([x,y])=>({x:ox+x,y:oy+y,z:height(ox+x,oy+y)}))
 const tin=buildBreaklineTIN(points,[{type:'hard',points:[points[6],points[7],points[8]]}])
 const contours=generateTINContours(tin,{interval:0.5,maxVertexSpacing:3})
 expect(tin.hasConstraints).toBe(true)
 expect(contours.length).toBeGreaterThan(1)
 for(const contour of contours)for(const path of contour.coordinates)for(let i=0;i<path.length;i++){
   const [x,y]=path[i];expect(height(x,y)).toBeCloseTo(contour.elevation,7)
   if(i)expect(Math.hypot(x-path[i-1][0],y-path[i-1][1])).toBeLessThanOrEqual(3.00000001)
 }
})

test('rejects malformed mesh connectivity before flat and contour-free early exits', () => {
  const flat = buildBreaklineTIN(plane.map(point => ({ ...point, z: 2 })))
  expect(() => generateTINContours({ ...flat, triangles: [{ a: 0, b: 1, c: 99 }] }, { interval: 1 })).toThrow(/invalid triangle index/i)
  expect(() => generateTINContours({ ...flat, triangles: [{ a: 0, b: 0, c: 1 }] }, { interval: 1 })).toThrow(/invalid triangle index/i)
  const collinear = { ...flat, points: [{ x: 0, y: 0, z: 0.1 }, { x: 1, y: 1, z: 0.2 }, { x: 2, y: 2, z: 0.3 }], triangles: [{ a: 0, b: 1, c: 2 }] }
  expect(() => generateTINContours(collinear, { interval: 1 })).toThrow(/degenerate/i)
})