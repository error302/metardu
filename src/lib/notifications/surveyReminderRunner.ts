import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { formatScheduleTime } from '@/lib/schedule/contracts'
import { sendSurveyPush,type DeviceSubscription } from './webPush'

interface Claim { id:string;user_id:string;organization_id:string|null;expires_at:Date;lease_token:string }
interface Message extends Claim {
  schedule_id:string;notification_id:string|null;project_name:string;title:string;starts_at:Date;time_zone:string;kind:string;schedule_version:number
}
interface Device extends DeviceSubscription { id:string }
async function service(client:PoolClient,userId='',organizationId='') {
  await client.query<never>(
    "SELECT set_config('request.access_role','survey_reminders',true),set_config('request.user_id',$1,true),set_config('app.current_user_id',$2,true),set_config('request.organization_id',$3,true)",
    [userId,userId||'00000000-0000-0000-0000-000000000000',organizationId],
  )
}
async function claimNext():Promise<Claim|null> {
  return db.transaction(async client=>{
    await service(client)
    const token=randomUUID()
    const result=await client.query<Claim>(
      `UPDATE public.survey_reminder_outbox o
       SET status='sending',lease_token=$1,claimed_at=NOW(),attempts=attempts+1
       FROM (SELECT q.id FROM public.survey_reminder_outbox q JOIN public.job_schedule j ON j.id=q.schedule_id
         WHERE q.due_at<=NOW() AND q.expires_at>NOW() AND q.next_attempt_at<=NOW() AND q.attempts<5
           AND (q.status='pending' OR (q.status='sending' AND q.claimed_at<NOW()-INTERVAL '2 minutes'))
           AND j.version=q.schedule_version AND j.status='upcoming'
         ORDER BY q.due_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1) candidate,
         public.job_schedule job
       WHERE o.id=candidate.id AND job.id=o.schedule_id
       RETURNING o.id,o.user_id,job.organization_id,o.expires_at,o.lease_token`,[token],
    )
    return result.rows[0]??null
  })
}
async function prepare(claim:Claim) {
  return db.transaction(async client=>{
    await service(client,claim.user_id,claim.organization_id??'')
    const found=await client.query<Message>(
      `SELECT o.id,o.user_id,o.expires_at,o.lease_token,o.schedule_id,o.notification_id,o.kind,o.schedule_version,
       j.organization_id,j.title,j.starts_at,j.time_zone,p.name AS project_name
       FROM public.survey_reminder_outbox o JOIN public.job_schedule j ON j.id=o.schedule_id AND j.user_id=o.user_id
       JOIN public.projects p ON p.id=j.project_id
       WHERE o.id=$1 AND o.lease_token=$2 AND o.status='sending' AND o.expires_at>NOW()
         AND j.version=o.schedule_version AND j.status='upcoming' AND public.survey_schedule_project_access(p.id,FALSE)
       FOR UPDATE OF o`,[claim.id,claim.lease_token],
    )
    const row=found.rows[0]
    if(!row) {
      await client.query<never>("UPDATE public.survey_reminder_outbox SET status='cancelled',lease_token=NULL,last_error_code='PROJECT_OR_JOB_UNAVAILABLE' WHERE id=$1 AND lease_token=$2",[claim.id,claim.lease_token])
      return null
    }
    if(!row.notification_id) {
      const notification=await client.query<{id:string}>(
        `INSERT INTO public.notifications(user_id,type,category,title,message,action_url,action_label,metadata,expires_at)
         VALUES($1,'info','survey_schedule',$2,$3,$4,'Open scheduled survey',$5,$6) RETURNING id`,
        [row.user_id,(row.kind==='confirmation'?(row.schedule_version===1?'Survey scheduled: ':'Survey updated: '):'Survey reminder: ')+row.project_name,
         row.title+' · '+formatScheduleTime(row.starts_at.toISOString(),row.time_zone)+' ('+row.time_zone+')',
         '/schedule?job='+row.schedule_id,JSON.stringify({scheduleId:row.schedule_id,outboxId:row.id}),row.expires_at],
      )
      await client.query<never>('UPDATE public.survey_reminder_outbox SET notification_id=$3 WHERE id=$1 AND lease_token=$2',[row.id,row.lease_token,notification.rows[0].id])
    }
    const devices=await client.query<Device>(
      `SELECT s.id,s.endpoint,s.p256dh,s.auth_key FROM public.survey_push_subscriptions s
       WHERE s.user_id=$1 AND s.active=TRUE AND NOT EXISTS (
         SELECT 1 FROM public.survey_push_deliveries d WHERE d.outbox_id=$2 AND d.subscription_id=s.id AND d.status IN ('accepted','expired')
       ) ORDER BY s.created_at,s.id LIMIT 5`,[row.user_id,row.id],
    )
    return {message:row,devices:devices.rows}
  })
}
async function stillCurrent(claim:Claim) {
  return db.transaction(async client=>{
    await service(client)
    const result=await client.query<{id:string}>(
      `SELECT o.id FROM public.survey_reminder_outbox o JOIN public.job_schedule j ON j.id=o.schedule_id
       WHERE o.id=$1 AND o.lease_token=$2 AND o.status='sending' AND o.expires_at>NOW()
         AND j.version=o.schedule_version AND j.status='upcoming'`,[claim.id,claim.lease_token],
    )
    return Boolean(result.rows[0])
  })
}
async function receipt(claim:Claim,device:Device,status:'accepted'|'retry'|'expired',providerStatus:number|null) {
  await db.transaction(async client=>{
    await service(client)
    await client.query<never>(
      `INSERT INTO public.survey_push_deliveries(outbox_id,subscription_id,user_id,status,provider_status)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(outbox_id,subscription_id)
       DO UPDATE SET status=EXCLUDED.status,provider_status=EXCLUDED.provider_status,
         attempts=survey_push_deliveries.attempts+1,updated_at=NOW()
       WHERE survey_push_deliveries.status<>'accepted'`,[claim.id,device.id,claim.user_id,status,providerStatus],
    )
    if(status==='expired') await client.query<never>(
      'UPDATE public.survey_push_subscriptions SET active=FALSE,updated_at=NOW() WHERE id=$1 AND user_id=$2',[device.id,claim.user_id],
    )
    if(status==='accepted') await client.query<never>(
      'UPDATE public.survey_push_subscriptions SET last_accepted_at=NOW() WHERE id=$1 AND user_id=$2',[device.id,claim.user_id],
    )
  })
}
async function finish(claim:Claim,retry:boolean,lastError:string|null) {
  await db.transaction(async client=>{
    await service(client)
    await client.query<never>(
      `UPDATE public.survey_reminder_outbox
       SET status=CASE WHEN $3 AND attempts<5 THEN 'pending' ELSE 'done' END,
         next_attempt_at=NOW()+INTERVAL '1 minute'*LEAST(30,power(2,attempts)::int),
         last_error_code=$4,lease_token=NULL,
         completed_at=CASE WHEN $3 AND attempts<5 THEN NULL ELSE NOW() END
       WHERE id=$1 AND lease_token=$2`,[claim.id,claim.lease_token,retry,lastError],
    )
  })
}
type Sender=(device:DeviceSubscription,outboxId:string,ttl:number)=>Promise<number>
/** Durable leases + per-device receipts permit safe concurrent app instances. */
export async function runSurveyReminderBatch(options:{send?:Sender;limit?:number}={}) {
  const send=options.send??sendSurveyPush,limit=Math.min(100,Math.max(1,options.limit??20))
  let claimed=0,accepted=0,retries=0,cancelled=0,reserved=0
  const lane=async()=>{
    while(reserved<limit) {
      reserved++
      const claim=await claimNext()
      if(!claim)return
      claimed++
      try {
        const item=await prepare(claim)
        if(!item){cancelled++;continue}
        let retry=false,lastError:string|null=null
        for(const device of item.devices) {
          if(!await stillCurrent(claim)){cancelled++;break}
          try {
            const status=await send(device,claim.id,(claim.expires_at.getTime()-Date.now())/1000)
            if(status<200||status>=300)throw Object.assign(new Error('PUSH_REJECTED'),{statusCode:status})
            await receipt(claim,device,'accepted',status);accepted++
          } catch(error) {
            const value=(error as {statusCode?:unknown}).statusCode
            const status=typeof value==='number'&&Number.isInteger(value)?value:null
            const expired=status===404||status===410
            await receipt(claim,device,expired?'expired':'retry',status)
            if(!expired){retry=true;lastError=status?'PROVIDER_'+status:'PUSH_TRANSPORT_ERROR'}
          }
        }
        if(retry)retries++
        await finish(claim,retry,lastError)
      } catch {
        retries++
        await finish(claim,true,'REMINDER_PROCESSING_FAILED')
      }
    }
  }
  await db.transaction(async client=>{
    await service(client)
    await client.query<never>("UPDATE public.survey_reminder_outbox SET status='done',lease_token=NULL,completed_at=NOW(),last_error_code='ATTEMPTS_EXHAUSTED' WHERE status='sending' AND attempts>=5 AND claimed_at<NOW()-INTERVAL '2 minutes'")
    await client.query<never>(
      "UPDATE public.survey_reminder_outbox o SET status='cancelled',lease_token=NULL,last_error_code='EXPIRED_OR_CHANGED' WHERE o.status IN ('pending','sending') AND (o.expires_at<=NOW() OR NOT EXISTS (SELECT 1 FROM public.job_schedule j WHERE j.id=o.schedule_id AND j.version=o.schedule_version AND j.status='upcoming'))",
    )
  })
  await Promise.all([lane(),lane(),lane(),lane()])
  return {claimed,accepted,retries,cancelled}
}
interface RunnerState {running:boolean;busy:boolean;lastRunAt:string|null;lastError:string|null;timer:ReturnType<typeof setInterval>|null}
const holder=globalThis as typeof globalThis&{__metarduSurveyReminderRunner?:RunnerState}
export function surveyReminderRuntimeStatus() {
  const state=holder.__metarduSurveyReminderRunner
  return {running:state?.running===true,lastRunAt:state?.lastRunAt??null,lastError:state?.lastError??null}
}
export function startSurveyReminderRunner() {
  if(process.env.METARDU_SURVEY_REMINDERS_ENABLED!=='true'||holder.__metarduSurveyReminderRunner?.running)return
  const state:RunnerState={running:true,busy:false,lastRunAt:null,lastError:null,timer:null}
  holder.__metarduSurveyReminderRunner=state
  const tick=async()=>{
    if(state.busy)return
    state.busy=true
    try {
      await runSurveyReminderBatch()
      if(!state.lastRunAt)logger.info('METARDU survey reminder runner completed its first cycle')
      state.lastRunAt=new Date().toISOString();state.lastError=null
    }
    catch { state.lastError='REMINDER_RUN_FAILED';logger.error('METARDU survey reminder runner failed; details suppressed') }
    finally { state.busy=false }
  }
  state.timer=setInterval(()=>{void tick()},60000)
  state.timer.unref()
  queueMicrotask(()=>{void tick()})
}
