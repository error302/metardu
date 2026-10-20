import { createCaptureDraftData, type SourceImport } from './captureDraft'
import { readCaptureReferences, captureReferenceColumns } from './captureReferences'
const project='22222222-2222-4222-8222-222222222222'
const data=createCaptureDraftData('leveling',[{batchId:'33333333-3333-4333-8333-333333333333',observationId:'44444444-4444-4444-8444-444444444444',projectId:project,clientId:'source-device',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,raw:{station:'TP1',surveyType:'leveling',rawForm:{bs:'0.000',is:'1.5000',fs:''}}}],
  {actorId:'11111111-1111-4111-8111-111111111111',reviewedAt:'2026-10-21T08:00:00.000Z',requestHash:'b'.repeat(64),bearingEncoding:'uninterpreted'})
test('opening or importing a book cannot silently discard malformed or cross-project source references',()=>{
  expect(readCaptureReferences(data,project)).toEqual(data.sourceImport)
  expect(()=>readCaptureReferences(data,'other-project')).toThrow(/project/i)
  expect(()=>readCaptureReferences({sourceImport:{bad:'metadata'}},project)).toThrow(/source/i)
})
test('CSV references identify original unknown authorship and distinguish edited book values',()=>{
  const source=data.sourceImport as SourceImport,row=(data.rows as Record<string,string>[])[0]
  expect(captureReferenceColumns(source,row)).toMatchObject({SourceClientID:'source-device',SourceInputHash:'a'.repeat(64),SourceCaptureAuthor:'unknown',SourceBookRowChanged:'no'})
  expect(captureReferenceColumns(source,{...row,bs:'9.999'})).toMatchObject({SourceBookRowChanged:'yes'})
  expect(source.sources[0].raw).toMatchObject({rawForm:{bs:'0.000'}})
})
