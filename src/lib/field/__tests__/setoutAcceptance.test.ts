import { createSetoutCaptureSnapshot, parseSetoutCaptureSnapshot } from '../setoutCapture'
import type { SetoutCaptureInput } from '../setoutCapture'
import archived from '@/test-utils/fixtures/setout-capture-v1.json'
const fixtureCrs='EPSG:21037'
const profile={id:'profile-1',name:'Synthetic issued criteria',jurisdiction:'Synthetic job',version:'R1',horizontalM:0.01,verticalM:0.005,effectiveDate:'2026-10-14',source:'Synthetic drawing D1',approvedBy:'Synthetic reviewer'}
const point={easting:500000,northing:9800000,rl:100}
const input:SetoutCaptureInput={projectId:'p',definitionId:'d',pointId:'pt',pointLabel:'P1',designRevision:1,horizontalCrs:fixtureCrs,definitionCrs:fixtureCrs,deviceCrs:fixtureCrs,verticalDatum:'BM1',deviceVerticalDatum:'BM1',capturedToleranceProfileId:profile.id,capturedAt:'2026-10-14T06:00:00Z',design:point,capturedDesign:point,observed:point,reportedAccuracyM:0.001,reportedVerticalAccuracyM:0.001,profile}
it('creates a current versioned numerical comparison with independently entered H/V accuracy',()=>{
  const snapshot=createSetoutCaptureSnapshot(input)
  expect(snapshot.schemaVersion).toBe(2)
  expect(snapshot.algorithm.version).toBe('2')
  expect(snapshot.assessment.result).toBe('PASS')
  expect(snapshot.assessment.message).toMatch(/numerical|entered/i)
  expect(parseSetoutCaptureSnapshot(snapshot)).toEqual(snapshot)
})
it('records differences but cannot fabricate thresholds or PASS without an adopted profile',()=>{
  const snapshot=createSetoutCaptureSnapshot({...input,profile:null,capturedToleranceProfileId:null,observed:{...point,easting:500000.02}})
  expect(snapshot.assessment.result).toBe('INFO')
  expect(snapshot.tolerance.horizontalM).toBeNull()
  expect(snapshot.tolerance.verticalM).toBeNull()
  expect(snapshot.tolerance.source).toBe('not_provided')
  expect(snapshot.assessment.dE).toBeCloseTo(0.02,8)
  expect(snapshot.assessment.message).toMatch(/criteria|profile/i)
})
it.each([
  {deviceCrs:null}, {definitionCrs:null}, {capturedAt:null}, {verticalDatum:null},
  {deviceVerticalDatum:null},{reportedAccuracyM:null},{reportedAccuracyM:0},
  {reportedVerticalAccuracyM:null},{reportedVerticalAccuracyM:0},{reportedVerticalAccuracyM:0.01},
  {capturedToleranceProfileId:null},{capturedToleranceProfileId:'different'},
  {capturedDesign:{...point,easting:500000.0001}},
])('keeps incomplete capture evidence unassessed: %j',patch=>{
  const snapshot=createSetoutCaptureSnapshot({...input,...patch})
  expect(snapshot.assessment.result).toBe('INFO')
  expect(snapshot.acceptance.issues.length).toBeGreaterThan(0)
})
it('can compare a horizontal-only target without inventing a height reference or V reading',()=>{
  const p={...point,rl:null}
  const snapshot=createSetoutCaptureSnapshot({...input,design:p,capturedDesign:p,observed:p,verticalDatum:null,deviceVerticalDatum:null,reportedVerticalAccuracyM:null})
  expect(snapshot.assessment.result).toBe('PASS')
  expect(snapshot.assessment.dZ).toBeNull()
})
it('rejects negative uncertainty and inconsistent saved eligibility/thresholds',()=>{
  expect(()=>createSetoutCaptureSnapshot({...input,reportedVerticalAccuracyM:-1})).toThrow(/accuracy|uncertainty/i)
  const snapshot=createSetoutCaptureSnapshot(input)
  expect(parseSetoutCaptureSnapshot({...snapshot,acceptance:{...snapshot.acceptance,issues:['tampered']}})).toBeNull()
  expect(parseSetoutCaptureSnapshot({...snapshot,tolerance:{...snapshot.tolerance,horizontalM:0.02}})).toBeNull()
})
it('parses reordered PostgreSQL JSON objects and preserves the recorded v1 numerical result',()=>{
  const snapshot=createSetoutCaptureSnapshot(input)
  const reordered={...snapshot,tolerance:Object.fromEntries(Object.entries(snapshot.tolerance).reverse()),acceptance:Object.fromEntries(Object.entries(snapshot.acceptance).reverse())}
  expect(parseSetoutCaptureSnapshot(reordered)).toEqual(snapshot)
  const historical=parseSetoutCaptureSnapshot(archived)
  expect(historical?.schemaVersion).toBe(1)
  expect(historical?.assessment.result).toBe('WARN')
  expect(historical?.tolerance.source).toBe('metardu_default')
})
