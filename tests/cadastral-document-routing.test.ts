/** @jest-environment node */
import {generateDocument} from '@/lib/submission/assembleDocument'
import {db} from '@/lib/db'
import {mergeGateInput} from '@/lib/validation/statutoryGateLoader'
jest.mock('@/lib/storage',()=>({uploadFile:async()=> 'qa/file.pdf',getSignedUrl:async()=>'/api/storage?path=qa%2Ffile.pdf'}))
jest.mock('@/lib/db',()=>{const db={query:jest.fn(async()=>({rows:[]}))};return {__esModule:true,default:db,db}})
jest.mock('@/lib/survey/fetchSurveyorProfile',()=>({fetchSurveyorProfile:async()=>({surveyorName:'QA',licenseNumber:'LICENCE-QA',iskNumber:'ISK-QA'})}))
jest.mock('@/lib/validation/statutoryGateLoader',()=>({loadGateInputForProject:async()=>({surveyor:{}}),mergeGateInput:jest.fn((a,b)=>({...a,...b}))}))
jest.mock('@/lib/validation/statutoryGate',()=>({runStatutoryGate:()=>({passed:true}),formatGateResult:()=>''}))
jest.mock('@/lib/generators/deedPlan',()=>({generateDeedPlan:async()=>Buffer.from('%PDF fixture')}))
jest.mock('@/lib/audit/auditLog',()=>({appendAuditEntry:async()=>{}}))
test('deed-plan generation uses the licence field independently of ISK membership',async()=>{
 await generateDocument({projectId:'qa',documentId:'deed-plan',surveyType:'cadastral'})
 expect(mergeGateInput).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({surveyor:{name:'QA',licenseNumber:'LICENCE-QA'}}))
})
test('RIM generation identifies the missing section instead of claiming the generator is unimplemented',async()=>{
 ;(db.query as jest.Mock).mockResolvedValue({rows:[]})
 await expect(generateDocument({projectId:'qa',documentId:'rim',surveyType:'cadastral'})).rejects.toThrow('Save one RIM section')
})
