import { preparePointImport, type PointImportRequest } from '../pointImport'
import type { StageReference } from '@/lib/workspaces/stageReference'

const reference: StageReference = {code:'EPSG:32737',name:'Synthetic project',source:'declared',hemisphere:'S',verticalDatum:'Synthetic BM',distanceMode:'grid'}
const body=(changes:Partial<PointImportRequest>={}):PointImportRequest=>({requestId:'11111111-1111-4111-8111-111111111111',fileName:'points.csv',sourceText:'id,easting,northing,elevation\nP1,500000,9850000,',fileSize:0,sourceFileHash:'a'.repeat(64),selectedIndices:[0],options:{},sourceCrs:'EPSG:32737',coordinateUnit:'metres',heightUnit:'metres',expectedReferenceHash:'b'.repeat(64),confirmTransformation:false,confirmVerticalDatum:false,confirmWarnings:false,...changes})

test('absent height stays null and does not require a fictional height datum',()=>{
  const result=preparePointImport(body(),{...reference,verticalDatum:null})
  expect(result.points[0]).toMatchObject({pointName:'P1',easting:500000,northing:9850000,elevation:null})
})
test('explicit zero and negative heights survive with operator datum confirmation',()=>{
  const result=preparePointImport(body({sourceText:'id,easting,northing,elevation\nP1,500000,9850000,0\nP2,500010,9850010,-1.23',selectedIndices:[0,1],confirmVerticalDatum:true}),reference)
  expect(result.points.map(point=>point.elevation)).toEqual([0,-1.23])
})
test('selected incomplete points reject the whole import instead of becoming the origin',()=>{
  expect(()=>preparePointImport(body({sourceText:'id,easting,northing,elevation\nP1,500000,9850000,\nP2,500010,,',selectedIndices:[0,1]}),reference)).toThrow(/P2.*northing/i)
})
test('numeric prefixes are not measurements',()=>{
  expect(()=>preparePointImport(body({sourceText:'id,easting,northing\nP1,500000m,9850000'}),reference)).toThrow(/easting/i)
})
test('feet convert once with independent horizontal and height units',()=>{
  const result=preparePointImport(body({sourceText:'id,easting,northing,elevation\nP1,1000000,30000000,100',coordinateUnit:'internationalFoot',heightUnit:'internationalFoot',confirmVerticalDatum:true}),reference)
  expect(result.points[0]).toMatchObject({easting:304800,northing:9144000,elevation:30.48})
})
test('geographic coordinates require explicit transformation and preserve real zero latitude',()=>{
  const request=body({sourceText:'id,easting,northing\nP1,39,0',sourceCrs:'EPSG:4326',coordinateUnit:'degrees'})
  expect(()=>preparePointImport(request,reference)).toThrow(/confirm.*transform/i)
  const point=preparePointImport({...request,confirmTransformation:true},reference).points[0]
  expect(point.easting).toBeCloseTo(500000,6)
  expect(point.northing).toBeCloseTo(10000000,6)
})
test('display-only and undeclared project CRS fail closed',()=>{
  expect(()=>preparePointImport(body({sourceCrs:'EPSG:3857'}),reference)).toThrow(/display.only/i)
  expect(()=>preparePointImport(body(),{code:null,name:'Reference system not set',source:'missing',hemisphere:null,verticalDatum:null,distanceMode:null})).toThrow(/declare/i)
})
test('duplicate point names and repeated selections cannot enter a batch',()=>{
  expect(()=>preparePointImport(body({sourceText:'id,easting,northing\nP1,500000,9850000\nP1,500010,9850010',selectedIndices:[0,1]}),reference)).toThrow(/duplicate/i)
  expect(()=>preparePointImport(body({selectedIndices:[0,0]}),reference)).toThrow(/duplicate/i)
})
test('unselected invalid records are retained in the source and require review acknowledgement',()=>{
  const request=body({sourceText:'id,easting,northing\nP1,500000,9850000\nP2,500010,',selectedIndices:[0]})
  expect(()=>preparePointImport(request,reference)).toThrow(/review|exclude/i)
  const result=preparePointImport({...request,confirmWarnings:true},reference)
  expect(result.points).toHaveLength(1)
  expect(result.excludedCount).toBe(1)
})
