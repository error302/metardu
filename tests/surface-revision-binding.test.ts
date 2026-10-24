jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
import { db } from '@/lib/db'
import { hashSurfaceValue, loadSurfaceRevision, verifySurfaceRevision, type SurfaceRevisionRow } from '@/lib/topo/surfaceRevision'
import { buildProjectReferenceSystem, toReferenceSystemRow } from '@/lib/spatial/projectReferenceSystem'
import { pointImportReferenceHash } from '@/lib/import/pointImportServer'
import { normalizeTerrainDomain } from '@/lib/topo/terrainDomainValidation'

const PROJECT = '11111111-1111-4111-8111-111111111111', OWNER = '22222222-2222-4222-8222-222222222222'
const CRS = 'EPSG:21037'
function fixture() {
  const reference = toReferenceSystemRow(PROJECT, { prs: buildProjectReferenceSystem({ datum: 'ARC1960', utmZone: 37, hemisphere: 'S', verticalDatum: 'Synthetic BM', verticalReference: 'local', distanceMode: 'grid', coordinatePrecision: 3 }) }, OWNER)
  const ids = [1, 2, 3].map(value => `33333333-3333-4333-8333-33333333333${value}`)
  const parameters = { interval: 1, maxVertexSpacing: 1, indexInterval: 5 }
  const snapshot = { schemaVersion: 2, sourceAdmissionVersion: 'surface-source-v2', hashAlgorithm: 'sha256-canonical-json-v1',
    reference, referenceHash: pointImportReferenceHash(reference), parameters, fieldVerified: false,
    sourceSelection: { mode: 'explicit_point_ids', pointIds: ids },
    observations: ids.map((id, i) => ({ id, pointName: `P${i}`, x: 500000 + i * 10, y: 9850000 + i * 10, z: i - 2, horizontalCrs: CRS, verticalDatum: 'Synthetic BM', code: null })),
  }
  const lines = [{ elevation: -1, isIndex: false, coordinates: [[[500000, 9850010], [500010, 9850000]]] }]
  const mesh = { points: snapshot.observations, triangles: [[0, 1, 2]] }
  return { surface_id: OWNER, revision_id: ids[0], project_id: PROJECT, name: 'Synthetic', revision: 1,
    crs: CRS, contour_crs: CRS, input_hash: hashSurfaceValue(snapshot), point_count: 3, parameters, lines,
    result: { snapshot, mesh, outputIntegrity: { algorithm: 'sha256-canonical-json-v1', contoursHash: hashSurfaceValue(lines), meshHash: hashSurfaceValue(mesh) } } } satisfies SurfaceRevisionRow
}
test('retained zero/negative original XYZ and open contours are read together', () => {
  const record = verifySurfaceRevision(fixture())
  expect(record.snapshot.observations.map(point => point.z)).toEqual([-2, -1, 0])
  expect(record.contours[0].coordinates[0]).toHaveLength(2)
  expect(record.fieldVerified).toBe(false)
})
test.each(['source', 'contours', 'mesh', 'parameters', 'reference', 'selection', 'count', 'legacy'])('refuses %s evidence inconsistencies without repairing the original', name => {
  const row = fixture()
  const result = row.result as { snapshot: { referenceHash: string; sourceSelection: { pointIds: string[] }; observations: Array<{ z: number }> }; mesh: unknown; outputIntegrity?: unknown }
  if (name === 'source') result.snapshot.observations[0].z = 99
  if (name === 'contours') row.lines = []
  if (name === 'mesh') result.mesh = {}
  if (name === 'parameters') row.parameters = { ...row.parameters, interval: 5 }
  if (name === 'reference') { result.snapshot.referenceHash = 'f'.repeat(64); row.input_hash = hashSurfaceValue(result.snapshot) }
  if (name === 'selection') { result.snapshot.sourceSelection.pointIds[1] = result.snapshot.sourceSelection.pointIds[0]; row.input_hash = hashSurfaceValue(result.snapshot) }
  if (name === 'count') row.point_count = 4
  if (name === 'legacy') delete result.outputIntegrity
  const original = JSON.stringify(row)
  expect(() => verifySurfaceRevision(row)).toThrow('lacks consistent source and output evidence')
  expect(JSON.stringify(row)).toBe(original)
})
test('exact project and revision are required; a foreign or absent revision has no latest fallback', async () => {
  jest.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
  await expect(loadSurfaceRevision(PROJECT, OWNER)).rejects.toMatchObject({ statusCode: 404 })
  expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('s.project_id = $1 AND r.id = $2'), [PROJECT, OWNER])
})
test('duplicate contour bindings are refused instead of taking the first', async () => {
  jest.mocked(db.query).mockResolvedValueOnce({ rows: [fixture(), fixture()], rowCount: 2 } as never)
  await expect(loadSurfaceRevision(PROJECT, OWNER)).rejects.toMatchObject({ statusCode: 409 })
})

function maskedFixture() {
  const original=fixture()
  const terrainDomain={ horizontalCrs:CRS, units:'metres', sourceLabel:'Synthetic reviewed footprint', supportUseReviewed:true,
    regions:[{outer:[{x:500001,y:9850001},{x:500009,y:9850001},{x:500009,y:9850009},{x:500001,y:9850009}],holes:[]}] }
  const domain={normalizedDomain:normalizeTerrainDomain(terrainDomain),area:64,derivedVertexCount:4,
    definitionHash:hashSurfaceValue(terrainDomain),supportCounts:{inside:0,outside:3,exclusion:0},supportSemantics:'all_selected_observations_support_parent_tin'}
  const result={...original.result,snapshot:{...original.result.snapshot,terrainDomain,
    breaklines:[] as Array<{type:string;points:Array<{x:number;y:number;z:number}>}>,
    breaklineSources:[] as Array<{kind:string;pointIds:string[];sourceLabel:string;reviewed:boolean;fieldVerified:boolean}>},
    sourceMesh:original.result.mesh as unknown,domain,
    outputIntegrity:{...original.result.outputIntegrity,domainHash:hashSurfaceValue(domain),sourceMeshHash:hashSurfaceValue(original.result.mesh)}}
  const row:SurfaceRevisionRow={...original,result,input_hash:hashSurfaceValue(result.snapshot)}
  return {row,result}
}
test('masked reads retain the exact declared domain and separate parent mesh',()=>{
  const {row}=maskedFixture()
  expect(verifySurfaceRevision(row).domain).toMatchObject({area:64,derivedVertexCount:4})
})
test.each(['domain','parent','definition','normalized','counts','basis','invalid-ring','chain'])('masked reads refuse inconsistent %s evidence with a reviewable conflict',kind=>{
  const {row,result}=maskedFixture()
  if(kind==='domain')result.domain.area=65
  if(kind==='parent')result.sourceMesh={}
  if(kind==='definition')result.domain.definitionHash='f'.repeat(64)
  if(kind==='normalized')result.domain.normalizedDomain.regions[0].outer[0].x+=1
  if(kind==='counts')result.domain.supportCounts.outside=4
  if(kind==='basis')result.snapshot.terrainDomain.horizontalCrs='unmatched declared CRS'
  if(kind==='invalid-ring') {
    const ring=result.snapshot.terrainDomain.regions[0].outer
    ;[ring[1],ring[2]]=[ring[2],ring[1]]
    result.domain.definitionHash=hashSurfaceValue(result.snapshot.terrainDomain)
  }
  if(kind==='chain') {
    result.snapshot.breaklines=[{type:'hard',points:[{x:1,y:2,z:3},{x:4,y:5,z:6}]}]
    result.snapshot.breaklineSources=[{kind:'measured_point_chain',pointIds:result.snapshot.sourceSelection.pointIds.slice(0,2),sourceLabel:'Synthetic',reviewed:true,fieldVerified:false}]
  }
  if(!['domain','parent'].includes(kind)) {
    result.outputIntegrity.domainHash=hashSurfaceValue(result.domain)
    row.input_hash=hashSurfaceValue(result.snapshot)
  }
  const before=JSON.stringify(row)
  try { verifySurfaceRevision(row); throw new Error('Unexpected acceptance') }
  catch(error) { expect(error).toMatchObject({statusCode:409,code:'SURFACE_REVISION_UNVERIFIED'}) }
  expect(JSON.stringify(row)).toBe(before)
})
