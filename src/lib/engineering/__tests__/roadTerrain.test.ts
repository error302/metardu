/** @jest-environment node */
import { sectionFromRetainedTerrain, terrainPreviewRoad, type TerrainMesh } from '../roadTerrain'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
const plane:TerrainMesh={points:[{x:-50,y:-50,z:85},{x:50,y:-50,z:95},{x:50,y:50,z:115},{x:-50,y:50,z:105}],triangles:[{a:0,b:1,c:2},{a:0,b:2,c:3}]}
it('intersects retained triangle planes at exact breakpoints, preserving zero and signed offsets',()=>{
  const profile=sectionFromRetainedTerrain(plane,{easting:0,northing:0,bearing:0},20)
  expect(profile[0]).toEqual({offset:-20,level:98})
  expect(profile.find(p=>p.offset===0)).toEqual({offset:0,level:100})
  expect(profile.at(-1)).toEqual({offset:20,level:102})
})
it('uses the route bearing to evaluate a perpendicular section',()=>{
  const p=sectionFromRetainedTerrain(plane,{easting:0,northing:0,bearing:90},20)
  expect(p[0].level).toBeCloseTo(104,10)
  expect(p.at(-1)?.level).toBeCloseTo(96,10)
})
it('accepts a section lying on an actual shared triangle edge',()=>{
  expect(sectionFromRetainedTerrain(plane,{easting:0,northing:0,bearing:135},20).find(p=>p.offset===0)?.level).toBeCloseTo(100,10)
})
it('refuses outside coverage and never extends the nearest triangle',()=>{
  expect(()=>sectionFromRetainedTerrain(plane,{easting:45,northing:0,bearing:0},20)).toThrow(/cover|gap/i)
})
it('refuses an interior gap even when both section ends have terrain',()=>{
  const mesh:TerrainMesh={points:[{x:-20,y:-10,z:0},{x:-2,y:-10,z:0},{x:-2,y:10,z:0},{x:-20,y:10,z:0},{x:2,y:-10,z:0},{x:20,y:-10,z:0},{x:20,y:10,z:0},{x:2,y:10,z:0}],triangles:[{a:0,b:1,c:2},{a:0,b:2,c:3},{a:4,b:5,c:6},{a:4,b:6,c:7}]}
  expect(()=>sectionFromRetainedTerrain(mesh,{easting:0,northing:0,bearing:0},15)).toThrow(/cover|gap/i)
})
it('refuses overlapping faces and inconsistent heights',()=>{
  const mesh=structuredClone(plane)
  mesh.points.push(...plane.points.map(p=>({...p,z:p.z+1})))
  mesh.triangles.push({a:4,b:5,c:6},{a:4,b:6,c:7})
  expect(()=>sectionFromRetainedTerrain(mesh,{easting:0,northing:0,bearing:0},20)).toThrow(/ambiguous|overlap/i)
})
it.each([0,-1,Infinity,NaN])('refuses an invalid review width %s',width=>{
  expect(()=>sectionFromRetainedTerrain(plane,{easting:0,northing:0,bearing:0},width)).toThrow()
})
it('produces a separate computed preview and preserves the complete observed road',()=>{
  const {road,reference}=roadWorkbenchExample(),before=JSON.stringify(road)
  const moved={points:plane.points.map(p=>({...p,x:p.x+500000,y:p.y+9500000})),triangles:plane.triangles}
  const short={...road,ips:[road.ips[0],{...road.ips[0],id:'end',northing:9500020}],vips:[{id:'v1',chainage:0,reducedLevel:99},{id:'v2',chainage:20,reducedLevel:99}]}
  const preview=terrainPreviewRoad(short,reference,moved,{intervalM:10,halfWidthM:20})
  expect(preview.stations.map(s=>s.chainage)).toEqual([0,10,20])
  expect(preview.stations[1].groundLevel).toBeCloseTo(102,9)
  expect(JSON.stringify(road)).toBe(before)
  expect(short.stations).toBe(road.stations)
  expect(preview.stations).not.toBe(road.stations)
})
it('refuses excessive review station counts instead of truncating the road',()=>{
  const {road,reference}=roadWorkbenchExample()
  expect(()=>terrainPreviewRoad(road,reference,plane,{intervalM:0.1,halfWidthM:20})).toThrow(/500|package/i)
})
