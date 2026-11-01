/** @jest-environment node */
import type{PoolClient}from'pg'
import{db}from'@/lib/db'
import{logger}from'@/lib/logger'
import{startSurveyReminderRunner,surveyReminderRuntimeStatus}from'./surveyReminderRunner'
jest.mock('@/lib/db',()=>({db:{transaction:jest.fn()}}))
jest.mock('@/lib/logger',()=>({logger:{info:jest.fn(),error:jest.fn()}}))
jest.mock('./webPush',()=>({sendSurveyPush:jest.fn()}))
const originalFlag=process.env.METARDU_SURVEY_REMINDERS_ENABLED,originalState=Object.getOwnPropertyDescriptor(globalThis,'__metarduSurveyReminderRunner')
beforeEach(()=>{
 jest.useFakeTimers();jest.resetAllMocks();Reflect.deleteProperty(globalThis,'__metarduSurveyReminderRunner');process.env.METARDU_SURVEY_REMINDERS_ENABLED='true'
 const client={query:jest.fn().mockResolvedValue({rows:[]})}
 jest.mocked(db.transaction).mockImplementation(async fn=>fn(client as unknown as PoolClient))
})
afterEach(()=>{
 jest.clearAllTimers();jest.useRealTimers();if(originalState)Object.defineProperty(globalThis,'__metarduSurveyReminderRunner',originalState);else Reflect.deleteProperty(globalThis,'__metarduSurveyReminderRunner');if(originalFlag===undefined)delete process.env.METARDU_SURVEY_REMINDERS_ENABLED;else process.env.METARDU_SURVEY_REMINDERS_ENABLED=originalFlag
})
it('reports a safe startup failure, retries at the existing cadence and clears it on success',async()=>{
 jest.mocked(db.transaction).mockRejectedValueOnce(Object.assign(new Error('secret postgres credentials and project'),{code:'ECONNREFUSED'}))
 startSurveyReminderRunner();await jest.advanceTimersByTimeAsync(0)
 expect(surveyReminderRuntimeStatus()).toEqual({running:true,lastRunAt:null,lastError:'REMINDER_DATABASE_UNAVAILABLE'})
 expect(logger.error).toHaveBeenCalledWith('METARDU survey reminder runner failed; details suppressed',{failureCode:'REMINDER_DATABASE_UNAVAILABLE'})
 expect(JSON.stringify(jest.mocked(logger.error).mock.calls)).not.toMatch(/secret postgres|credentials|project/)
 await jest.advanceTimersByTimeAsync(60000)
 expect(surveyReminderRuntimeStatus()).toMatchObject({running:true,lastError:null})
 expect(surveyReminderRuntimeStatus().lastRunAt).toEqual(expect.any(String))
 expect(logger.info).toHaveBeenCalledWith('METARDU survey reminder runner completed its first cycle')
})
it('records a later recovery once and retains one non-overlapping runner interval',async()=>{
 const firstCycle=new Promise<void>(resolve=>jest.mocked(logger.info).mockImplementationOnce(()=>{resolve()}))
 startSurveyReminderRunner();startSurveyReminderRunner();await jest.advanceTimersByTimeAsync(0);await firstCycle
 expect(surveyReminderRuntimeStatus().lastRunAt).not.toBeNull()
 expect(jest.getTimerCount()).toBe(1)
 jest.mocked(db.transaction).mockRejectedValue(Object.assign(new Error('private statement'),{code:'57014'}))
 await jest.advanceTimersByTimeAsync(60000);expect(surveyReminderRuntimeStatus().lastError).toBe('REMINDER_DATABASE_TIMEOUT')
 const client={query:jest.fn().mockResolvedValue({rows:[]})};jest.mocked(db.transaction).mockImplementation(async fn=>fn(client as unknown as PoolClient))
 const recoveredCycle=new Promise<void>(resolve=>jest.mocked(logger.info).mockImplementationOnce(()=>{resolve()}))
 await jest.advanceTimersByTimeAsync(60000);await recoveredCycle
 expect(logger.info).toHaveBeenCalledWith('METARDU survey reminder runner recovered after a failed cycle',{previousFailure:'REMINDER_DATABASE_TIMEOUT'})
 const calls=jest.mocked(logger.info).mock.calls.length;await jest.advanceTimersByTimeAsync(60000);expect(jest.mocked(logger.info).mock.calls.length).toBe(calls)
})
it('does not start when reminders are disabled',()=>{
 process.env.METARDU_SURVEY_REMINDERS_ENABLED='false';startSurveyReminderRunner();expect(surveyReminderRuntimeStatus().running).toBe(false);expect(jest.getTimerCount()).toBe(0)
})
