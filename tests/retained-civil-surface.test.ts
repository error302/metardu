/** @jest-environment node */
import {XMLParser} from 'fast-xml-parser'
import {civilHash,civilSurfaceFixture,clippedCivilSurfaceFixture,projectId,revisionId} from './civil-surface-fixture'
import {generateRetainedCivilSurface,inspectRetainedCivilSurface} from '@/lib/export/retainedCivilSurface'

test('road terrain inspection reuses the exact retained-mesh validation without generating a replacement TIN',()=>{
  const row=civilSurfaceFixture(),before=JSON.stringify(row)
  const result=inspectRetainedCivilSurface(row,projectId,revisionId)
  expect(result.row.result.mesh).toEqual(row.result.mesh)
  expect(result.reference.prs.verticalDatum).toBe('SYNTHETIC local BM')
  expect(result.area).toBe(100)
  expect(JSON.stringify(row)).toBe(before)
  row.result.mesh.points[0].z=50
  expect(()=>inspectRetainedCivilSurface(row,projectId,revisionId)).toThrow()
})
test('a retained mesh exports real 3D vertices, faces and breakline edge flags without retriangulation',()=>{
  const row=civilSurfaceFixture(),before=JSON.stringify(row)
  const xml=generateRetainedCivilSurface(row,projectId,revisionId)
  const parsed=new XMLParser({ignoreAttributes:false}).parse(xml) as {LandXML:{Surfaces:{Surface:{Definition:{Pnts:{P:unknown[]};Faces:{F:unknown[]}}}}}}
  expect(parsed.LandXML.Surfaces.Surface.Definition.Pnts.P).toHaveLength(4)
  expect(parsed.LandXML.Surfaces.Surface.Definition.Faces.F).toHaveLength(2)
  expect(xml).toContain('<P id="1">9800000 500000 0</P>')
  expect(xml).toContain('<F b="1">1 2 3</F>')
  expect(xml).toContain('SYNTHETIC local BM')
  expect(xml).toContain(row.input_hash);expect(xml).toContain(revisionId)
  expect(JSON.stringify(row)).toBe(before)
})
test.each(['input','mesh','reference','project','revision','count'])('%s mismatch refuses an artifact',kind=>{
  const row=civilSurfaceFixture()
  if(kind==='input')row.input_hash='a'.repeat(64)
  if(kind==='mesh')row.result.mesh.points[0].z=50
  if(kind==='reference')row.result.snapshot.referenceHash='b'.repeat(64)
  if(kind==='project')row.project_id='other'
  if(kind==='revision')row.revision_id='other'
  if(kind==='count')row.triangle_count=3
  expect(()=>generateRetainedCivilSurface(row,projectId,revisionId)).toThrow()
})
test.each(['range','degenerate','duplicate','index','nonmanifold'])('even a matching hash cannot admit %s faces',kind=>{
  const row=civilSurfaceFixture(),mesh=row.result.mesh
  if(kind==='range')mesh.points[0].x=-100
  if(kind==='degenerate')mesh.triangles[0]={a:0,b:0,c:2}
  if(kind==='duplicate')mesh.triangles[1]={a:2,b:1,c:0}
  if(kind==='index')mesh.triangles[0].c=10
  if(kind==='nonmanifold'){mesh.points.push({x:500020,y:9800005,z:4});mesh.triangles.push({a:1,b:2,c:4});row.triangle_count=3}
  row.result.outputIntegrity.meshHash=civilHash(mesh)
  expect(()=>generateRetainedCivilSurface(row,projectId,revisionId)).toThrow()
})
test('an exclusion is handed off as the clipped retained faces without filling its hole',()=>{
  const row=clippedCivilSurfaceFixture(),before=JSON.stringify(row)
  const xml=generateRetainedCivilSurface(row,projectId,revisionId)
  expect(xml.match(/<P id=/g)).toHaveLength(8)
  expect(xml.match(/<F>/g)).toHaveLength(8)
  expect(xml).toContain('area2DSurf="84"');expect(xml).toContain('SYNTHETIC annulus')
  expect(JSON.stringify(row)).toBe(before)
  row.result.domain.area=100;row.result.outputIntegrity.domainHash=civilHash(row.result.domain)
  expect(()=>generateRetainedCivilSurface(row,projectId,revisionId)).toThrow()
})
