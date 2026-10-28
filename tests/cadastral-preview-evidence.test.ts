/** @jest-environment node */
import { z } from 'zod'
import {NextRequest} from 'next/server'
import {GET} from '@/app/api/submission/preview/route'
import {requireProjectOwnership} from '@/lib/auth/ownership'
import {db} from '@/lib/db'
import {computeDeedPlanGeometry} from '@/lib/generators/deedPlanGeometry'
jest.mock('@/lib/auth/requireAuth',()=>({requireAuth:async()=>({session:{user:{id:'qa'}},error:null})}))
jest.mock('@/lib/auth/ownership',()=>({requireProjectOwnership:jest.fn(async()=>({ok:true}))}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn(async()=>({rows:[{survey_type:'cadastral',lr_number:'FICTIONAL'}]}))}}))
jest.mock('@/lib/survey/fetchSurveyorProfile',()=>({fetchSurveyorProfile:async()=>({surveyorName:'Fictional',licenseNumber:'QA',iskNumber:'',firmName:''})}))
jest.mock('@/lib/generators/deedPlanGeometry',()=>({computeDeedPlanGeometry:jest.fn(async()=>({stations:[
 {station:'A1',easting:500000,northing:9900000},{station:'A2',easting:500000,northing:9900080},
 {station:'A10',easting:500100,northing:9900080},{station:'A3',easting:500100,northing:9900000}],
 areaM2:8000,misclosureMm:0,precisionRatio:'1:Infinity',coordinateSource:'pre_adjusted'}))}))
beforeEach(()=>jest.clearAllMocks())
test('preview uses export geometry without inventing observations or allocating a reference',async()=>{
 const res=await GET(new NextRequest('http://localhost/api/submission/preview?projectId=fictional'))
 const body=z.object({submissionRef:z.string(),parcel:z.record(z.string(),z.unknown()),traverse:z.object({points:z.array(z.object({pointName:z.string(),observedBearing:z.unknown().optional()})),angularMisclosure:z.unknown()})}).parse(await res.json())
 expect(res.status).toBe(200)
 expect(body.submissionRef).toBe('DRAFT - NOT SUBMITTED')
 expect(body.parcel).toMatchObject({areaM2:8000,perimeterM:360})
 expect(body.traverse.points.map(p=>p.pointName)).toEqual(['A1','A2','A10','A3'])
 expect(body.traverse.angularMisclosure).toBeNull()
 expect(body.traverse.points[0].observedBearing).toBeUndefined()
 expect(db.query).toHaveBeenCalledTimes(1)
 expect((db.query as jest.MockedFunction<typeof db.query>).mock.calls[0][0]).toMatch(/^SELECT /)
})
test('ownership is checked before loading preview geometry',async()=>{
 ;(requireProjectOwnership as jest.Mock).mockResolvedValueOnce({ok:false})
 const res=await GET(new NextRequest('http://localhost/api/submission/preview?projectId=someone-else'))
 expect(res.status).toBe(403)
 expect(db.query).not.toHaveBeenCalled()
 expect(computeDeedPlanGeometry).not.toHaveBeenCalled()
})
