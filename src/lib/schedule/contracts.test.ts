import { collectionSurveyType } from '@/lib/field/projectContext'
import { scheduleCreateSchema, scheduleUpdateSchema, localInputToInstant, formatScheduleTime, collectorUrl } from './contracts'
const job={request_id:'11111111-1111-4111-8111-111111111111',project_id:'22222222-2222-4222-8222-222222222222',title:'  Mwavumbo survey  ',starts_at:'2026-11-03T06:00:00Z',time_zone:'Africa/Nairobi',duration_minutes:120,reminder_minutes:[1440,60]}
it('requires a project and records the instant and local zone independently',()=>{
 const value=scheduleCreateSchema.parse(job)
 expect(value.title).toBe('Mwavumbo survey')
 expect(formatScheduleTime(value.starts_at,value.time_zone)).toContain('09:00')
 expect(scheduleCreateSchema.safeParse({...job,project_id:''}).success).toBe(false)
 expect(scheduleCreateSchema.safeParse({...job,time_zone:'Mars/Survey'}).success).toBe(false)
 expect(collectorUrl(value.project_id)).toBe('/field/collect?projectId='+job.project_id)
})
it('rejects duplicate reminders, unbounded notes, extra identity and empty updates',()=>{
 for(const data of [{...job,reminder_minutes:[60,60]},{...job,reminder_minutes:[-1]},{...job,notes:'x'.repeat(4001)},{...job,user_id:job.request_id}])
  expect(scheduleCreateSchema.safeParse(data).success).toBe(false)
 expect(scheduleUpdateSchema.safeParse({version:1}).success).toBe(false)
 expect(scheduleUpdateSchema.safeParse({version:0,status:'cancelled'}).success).toBe(false)
 expect(scheduleUpdateSchema.parse({version:1,status:'cancelled'}).status).toBe('cancelled')
})
it('rejects invalid local dates rather than allowing rollover',()=>{
 expect(()=>localInputToInstant('2026-02-30T12:00')).toThrow()
 expect(()=>localInputToInstant('2026-10-29')).toThrow()
 expect(Number.isFinite(Date.parse(localInputToInstant('2026-11-03T09:00')))).toBe(true)
})
it.each([['topo','topographic'],['boundary_survey','cadastral'],['road','engineering'],['geodetic','control'],['leveling',null],['hydrographic',null],[undefined,null]])('normalizes %s without inventing a collection profile',(input,expected)=>{
 expect(collectionSurveyType(input)).toBe(expected)
})
