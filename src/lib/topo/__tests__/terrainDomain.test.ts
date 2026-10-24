import { buildBreaklineTIN } from '../breaklineTIN'
import { clipTerrainDomain, type TerrainDomain } from '../terrainDomain'
import { generateTINContours } from '../tinContours'
import { interpolateZ } from '@/lib/survey/surfaceTIN'

const ring = (values: number[][]) => values.map(([x, y]) => ({ x, y }))
const square = ring([[0,0],[10,0],[10,10],[0,10]])
const plane = buildBreaklineTIN(square.map(point => ({ ...point, z: point.x })))
const domain = (outer = square, holes: ReturnType<typeof ring>[] = []): TerrainDomain => ({ regions: [{ outer, holes }] })
test('a reviewed hole removes terrain and splits a contour without bridging the exclusion', () => {
  const clipped = clipTerrainDomain(plane, domain(square, [ring([[4,4],[6,4],[6,6],[4,6]])]))
  expect(clipped.area).toBeCloseTo(96, 9)
  expect(interpolateZ(clipped, 5, 5)).toBeNull()
  const level = generateTINContours(clipped, { interval: 1 }).find(line => line.elevation === 5)
  expect(level?.coordinates).toHaveLength(2)
  const ends = level?.coordinates.map(path => [path[0][1],path[path.length-1][1]].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0])
  expect(ends).toEqual([[0,4],[6,10]])
})
test('concave boundaries retain the full reviewed L area rather than its convex hull', () => {
  const clipped = clipTerrainDomain(plane, domain(ring([[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]])))
  expect(clipped.area).toBeCloseTo(64, 9)
  expect(interpolateZ(clipped, 8, 8)).toBeNull()
  expect(interpolateZ(clipped, 2, 8)).toBeCloseTo(2, 9)
})
test('separate reviewed areas do not acquire a bridge between them', () => {
  const clipped = clipTerrainDomain(plane, { regions: [domain(ring([[1,1],[3,1],[3,3],[1,3]])).regions[0], domain(ring([[7,7],[9,7],[9,9],[7,9]])).regions[0]] })
  expect(clipped.area).toBeCloseTo(8, 9)
  expect(interpolateZ(clipped, 5, 5)).toBeNull()
})
test('clipping derives new heights on the original nonplanar TIN faces without refitting them', () => {
  const original = buildBreaklineTIN([...square.map(point => ({...point,z:0})), {x:5,y:5,z:4}])
  const clipped = clipTerrainDomain(original, domain(ring([[1,2],[9,1],[8,9],[2,8]])))
  expect(clipped.derivedVertexCount).toBeGreaterThan(0)
  for (const face of clipped.triangles) {
    const [a,b,c] = [clipped.points[face.a],clipped.points[face.b],clipped.points[face.c]], x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3
    expect((a.z+b.z+c.z)/3).toBeCloseTo(interpolateZ(original,x,y) as number, 9)
  }
})
test('a clipped ridge keeps the retained breakline heights', () => {
  const original = buildBreaklineTIN(square.map(point=>({...point,z:0})), [{type:'ridge',points:[{x:5,y:0,z:2},{x:5,y:10,z:2}]}])
  const clipped = clipTerrainDomain(original, domain(ring([[1,2],[9,2],[9,8],[1,8]])))
  expect(clipped.area).toBeCloseTo(48,9)
  expect(interpolateZ(clipped,5,5)).toBeCloseTo(2,9)
})
test('ring winding does not change reviewed terrain area', () => {
  const hole=ring([[4,4],[6,4],[6,6],[4,6]])
  expect(clipTerrainDomain(plane,domain([...square].reverse(),[[...hole].reverse()])).area).toBeCloseTo(96,9)
})
test.each([
  ['crossed outer', domain(ring([[0,0],[10,10],[10,0],[0,10]]))],
  ['hole outside outer', domain(square,[ring([[9,9],[11,9],[11,11],[9,11]])])],
  ['touching hole', domain(square,[ring([[0,2],[2,2],[2,4],[0,4]])])],
  ['nested exclusions', domain(square,[ring([[2,2],[8,2],[8,8],[2,8]]),ring([[3,3],[4,3],[4,4],[3,4]])])],
  ['outside measured hull', domain(ring([[-1,-1],[11,-1],[11,11],[-1,11]]))],
])('refuses %s instead of silently repairing or truncating it', (_name, value) => { expect(()=>clipTerrainDomain(plane,value)).toThrow() })
test('translated metre coordinates retain the independent 240 m2 area and 480 m3 plane integral', () => {
  const e=500000,n=9850000,xy=([[0,0],[20,0],[20,20],[0,20],[10,10]]).map(([x,y])=>({x:x+e,y:y+n,z:-2+.1*x+.1*y}))
  const shift=(values:number[][])=>ring(values).map(point=>({x:point.x+e,y:point.y+n}))
  const clipped=clipTerrainDomain(buildBreaklineTIN(xy),domain(shift([[2,2],[18,2],[18,18],[2,18]]),[shift([[8,8],[12,8],[12,12],[8,12]])]))
  expect(clipped.area).toBeCloseTo(240,7)
  const volume=clipped.triangles.reduce((sum,face)=>{const[a,b,c]=[clipped.points[face.a],clipped.points[face.b],clipped.points[face.c]];return sum+Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2*((a.z+b.z+c.z)/3+2)},0)
  expect(volume).toBeCloseTo(480,7)
})
test('even a small declared extension outside measured coverage is refused', () => {
  expect(()=>clipTerrainDomain(plane,domain(ring([[0,0],[10+1e-10,0],[10,10],[0,10]])))).toThrow('outside')
})
test('angled clipping at projected coordinates does not leave contour gaps at original triangle seams', () => {
  const points=[]
  for(let x=0;x<=10;x+=2)for(let y=0;y<=10;y+=2)points.push({x:500000+x,y:9850000+y,z:x})
  const boundary=ring([[.3,.7],[9.7,.4],[9.3,9.2],[.4,8.6]]).map(point=>({x:point.x+500000,y:point.y+9850000}))
  const clipped=clipTerrainDomain(buildBreaklineTIN(points),domain(boundary)),contours=generateTINContours(clipped,{interval:1,maxVertexSpacing:1})
  expect(contours).toHaveLength(9)
  for(const contour of contours) {
    expect(contour.coordinates).toHaveLength(1)
    for(const path of contour.coordinates)for(const[x]of path)expect(x-500000).toBeCloseTo(contour.elevation,8)
  }
})
test('an island within a separately declared exclusion remains a separate valid region', () => {
  const clipped=clipTerrainDomain(plane,{regions:[domain(square,[ring([[2,2],[8,2],[8,8],[2,8]])]).regions[0],domain(ring([[4,4],[6,4],[6,6],[4,6]])).regions[0]]})
  expect(clipped.area).toBeCloseTo(68,9)
  expect(interpolateZ(clipped,5,5)).toBeCloseTo(5,9)
  expect(interpolateZ(clipped,3,3)).toBeNull()
})

test('the whole boundary budget is admitted before expensive ring intersection work',()=>{
  const oversized=Array.from({length:1999},(_,i)=>({x:i%2,y:i%3}))
  expect(()=>clipTerrainDomain(plane,domain(oversized,[square]))).toThrow('2,000 boundary vertices')
})
