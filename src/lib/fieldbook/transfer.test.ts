import { parseFieldbookTransfer } from './transfer'
import { createCaptureDraftData } from './captureDraft'

const books = [
  { type: 'leveling', name: 'Road km 2', data: { method: 'rise_and_fall', openingRL: '102.4500', closingRL: '', distanceKm: '0.8', rows: [{ station: 'TP 1', bs: '1.010', is: '', fs: '', remarks: 'rained, check again' }] } },
  { type: 'traverse', name: 'Road control', data: { mode: 'link', startStation: 'CP1', startE: '350000.001', startN: '9850000.010', closeE: '', closeN: '', rows: [{ station: 'CP2', bearing: '45 10 15', slopeDist: '50.1230', hclDeg: '45', hclMin: '10', hclSec: '15', hcrDeg: '225', hcrMin: '10', hcrSec: '16', vaDeg: '90', vaMin: '0', vaSec: '1', ih: '0', th: '1.500', remarks: 'Face pair' }] } },
  { type: 'control', name: 'Detail', data: { activeSetupId: 's1', setups: [{ id: 's1', station: { name: 'CP1', e: '', n: '', z: '' }, rows: [{ pointId: 'edge, left', instrumentHeight: '', targetHeight: '0', bearing: '180.00001', verticalAngle: '', slopeDistance: '20.0000', remarks: 'Raw, incomplete observation\nwith Unicode: 測量' }] }] } },
]
it.each(books)('round trips every raw string for $type without inventing missing coordinates', book => {
  expect(parseFieldbookTransfer(JSON.stringify({ ...book, version: 1, id: 'untrusted', projectId: 'source-project' }))).toEqual({ ...book, version: 1, projectId: 'source-project' })
})
it('rejects malformed JSON with an actionable error', () => {
  expect(() => parseFieldbookTransfer('{')).toThrow('not valid JSON')
})
it('retains source snapshots and unknown authorship through JSON export/import',()=>{
  const project='22222222-2222-4222-8222-222222222222'
  const data=createCaptureDraftData('leveling',[{batchId:'33333333-3333-4333-8333-333333333333',observationId:'44444444-4444-4444-8444-444444444444',projectId:project,clientId:'device-1',inputHash:'a'.repeat(64),capturedBy:null,projectReference:null,
    raw:{id:'device-1',station:'TP1',surveyType:'leveling',rawForm:{station:'TP1',bs:'0.000',is:'',fs:'',remarks:'Original',futureField:'retain too'}}}],
  {actorId:'11111111-1111-4111-8111-111111111111',reviewedAt:'2026-10-21T08:00:00.000Z',requestHash:'b'.repeat(64),bearingEncoding:'uninterpreted'})
  expect(parseFieldbookTransfer(JSON.stringify({version:1,type:'leveling',name:'Source-linked draft',projectId:project,data})).data).toEqual(data)
})
it.each([
  { ...books[0], version: 2 },
  { ...books[0], data: { ...books[0].data, openingRL: 100 } },
  { type: 'control', name: 'Incomplete', data: { setups: [] } },
  { type: 'other', data: {} },
])('rejects unsupported or incomplete structures without coercion', book => {
  expect(() => parseFieldbookTransfer(JSON.stringify(book))).toThrow('not a supported METARDU fieldbook')
})
