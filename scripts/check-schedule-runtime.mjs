// Native business-flow checks use the real restricted PostgreSQL helper.
// The sender is injected; no real push provider or phone is contacted.
import assert from 'node:assert/strict'
import { AsyncResource } from 'node:async_hooks'
import { randomUUID,createECDH,randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
export async function runScheduleRuntimeChecks({runtimeUrl,admin,check}){
 const url=new URL(runtimeUrl)
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');assert.equal(url.pathname,'/metardu_schedule_upgrade_verify')
 Object.assign(process.env,{DATABASE_URL:runtimeUrl,AUTH_SECRET:'synthetic-schedule-upgrade-only',NODE_ENV:'test',DB_POOL_MAX:'8'})
 const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),load=Module._load,extension=Module._extensions['.ts']
 Module._load=function(request,parent,...args){return load.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...args)}
 Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)}
 const database=require('../src/lib/db.ts'),service=require('../src/lib/schedule/server.ts'),push=require('../src/lib/notifications/pushSubscriptions.ts'),{runSurveyReminderBatch}=require('../src/lib/notifications/surveyReminderRunner.ts')
 async function as(user,work){const resource=new AsyncResource('SCHEDULE_NATIVE_CHECK');try{return await resource.runInAsyncScope(()=>{database.setCurrentUserId(user);database.setCurrentOrgId(null);database.setCurrentRlsServiceRole(null);return work()})}finally{resource.emitDestroy()}}
 const ids=Object.fromEntries(['owner','other','viewer','project','privateProject'].map(key=>[key,randomUUID()]))
 const base={request_id:randomUUID(),project_id:ids.project,title:'SYNTHETIC Mwavumbo briefing',notes:'Retain café 零 and zero 0',location:'Synthetic site',starts_at:new Date(Date.now()+2*86400000).toISOString(),time_zone:'Africa/Nairobi',duration_minutes:120,reminder_minutes:[1440,60]}
 try{
  for(const id of [ids.owner,ids.other,ids.viewer])await admin.query("INSERT INTO users(id,email,password_hash,full_name)VALUES($1,$2,'unusable-synthetic','SYNTHETIC scheduling')",[id,id+'@example.invalid'])
  await admin.query("INSERT INTO projects(id,user_id,name,survey_type)VALUES($1,$2,'SYNTHETIC Mwavumbo','topo'),($3,$4,'SYNTHETIC private','cadastral')",[ids.project,ids.owner,ids.privateProject,ids.other])
  await admin.query("INSERT INTO project_members(project_id,user_id,role)VALUES($1,$2,'viewer')",[ids.project,ids.viewer])
  assert.deepEqual((await database.getPool().query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{rolsuper:false,rolbypassrls:false});check('canonical: actual business modules run as a non-superuser without BYPASSRLS')
  const job=await as(ids.owner,()=>service.createScheduledJob(ids.owner,base))
  assert.equal(job.project_name,'SYNTHETIC Mwavumbo');assert.equal(job.can_collect,true);assert.equal(job.notes,base.notes)
  assert.equal((await admin.query('SELECT count(*)::int n FROM survey_reminder_outbox WHERE schedule_id=$1',[job.id])).rows[0].n,3);check('canonical: project binding, Unicode notes, recorded zone and durable confirmation plus future reminders')
  assert.deepEqual(await as(ids.owner,()=>service.createScheduledJob(ids.owner,base)),job)
  assert.equal((await admin.query('SELECT count(*)::int n FROM survey_reminder_outbox WHERE schedule_id=$1',[job.id])).rows[0].n,3)
  await assert.rejects(as(ids.owner,()=>service.createScheduledJob(ids.owner,{...base,title:'conflicting retry'})),error=>error.code==='REQUEST_CONFLICT');check('canonical: retried saves are idempotent and conflicting request reuse is rejected')
  await assert.rejects(as(ids.other,()=>service.getScheduledJob(ids.other,job.id)),error=>error.statusCode===404||error.status===404||error.code==='NOT_FOUND')
  await assert.rejects(as(ids.owner,()=>service.createScheduledJob(ids.owner,{...base,request_id:randomUUID(),project_id:ids.privateProject})),error=>error.code==='PROJECT_NOT_FOUND')
  assert.equal((await as(ids.other,()=>service.listSchedules(ids.other,null,0,50))).schedules.length,0);check('canonical: another account cannot read jobs or attach private projects')
  const viewer=await as(ids.viewer,()=>service.createScheduledJob(ids.viewer,{...base,request_id:randomUUID()}))
  assert.equal(viewer.can_collect,false)
  await assert.rejects(as(ids.viewer,()=>service.updateScheduledJob(ids.viewer,viewer.id,{version:1,status:'in_progress'})),error=>error.code==='READ_ONLY_PROJECT')
  const counts=await as(ids.owner,()=>service.listScheduleProjects('',ids.project));assert.equal(counts.projects[0].id,ids.project);check('canonical: project readers can schedule personal reminders without gaining field write rights')
  await assert.rejects(as(ids.owner,()=>service.updateScheduledJob(ids.owner,job.id,{version:9,title:'stale'})),error=>error.code==='VERSION_CONFLICT')
  const changed=await as(ids.owner,()=>service.updateScheduledJob(ids.owner,job.id,{version:1,title:'SYNTHETIC changed'}))
  assert.equal(changed.notes,base.notes);assert.equal(changed.version,2)
  assert.equal((await admin.query("SELECT count(*)::int n FROM survey_reminder_outbox WHERE schedule_id=$1 AND schedule_version=1 AND status='cancelled'",[job.id])).rows[0].n,3);check('canonical: optimistic edits retain omitted fields and cancel the complete old reminder version')
  await as(ids.owner,()=>service.updateScheduledJob(ids.owner,job.id,{version:2,status:'cancelled'}))
  await as(ids.viewer,()=>service.updateScheduledJob(ids.viewer,viewer.id,{version:1,status:'cancelled'}))
  const delivery=await as(ids.owner,()=>service.createScheduledJob(ids.owner,{...base,request_id:randomUUID(),reminder_minutes:[]}))
  for(const label of ['accepted','retry','expired']){
   const key=createECDH('prime256v1');key.generateKeys()
   await as(ids.owner,()=>push.savePushSubscription(ids.owner,{endpoint:'https://fcm.googleapis.com/synthetic/'+label,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}))
  }
  const sends=[]
  const sender=async(device,id,ttl)=>{assert.match(id,/^[a-f0-9-]{36}$/);assert.ok(ttl>0);sends.push(device.endpoint);if(device.endpoint.endsWith('/retry'))throw Object.assign(new Error('synthetic retry'),{statusCode:503});if(device.endpoint.endsWith('/expired'))throw Object.assign(new Error('synthetic expired'),{statusCode:410});return 201}
  await Promise.all([runSurveyReminderBatch({send:sender,limit:1}),runSurveyReminderBatch({send:sender,limit:1})])
  assert.equal(sends.length,3);assert.equal(new Set(sends).size,3)
  const outbox=(await admin.query('SELECT * FROM survey_reminder_outbox WHERE schedule_id=$1',[delivery.id])).rows[0]
  assert.equal(outbox.status,'pending');assert.equal(outbox.attempts,1)
  const notice=(await admin.query('SELECT * FROM notifications WHERE id=$1',[outbox.notification_id])).rows[0]
  assert.ok(notice.title.includes('SYNTHETIC Mwavumbo'));assert.ok(notice.message.includes('Africa/Nairobi'));assert.equal(notice.action_url,'/schedule?job='+delivery.id)
  assert.equal((await admin.query("SELECT active FROM survey_push_subscriptions WHERE endpoint LIKE '%/expired'")).rows[0].active,false);check('canonical: concurrent durable claims create one project-aware notification and one receipt per device, expiring only 410 devices')
  await admin.query('UPDATE survey_reminder_outbox SET next_attempt_at=NOW() WHERE id=$1',[outbox.id])
  const retries=[]
  await runSurveyReminderBatch({send:async device=>{retries.push(device.endpoint);return 201}})
  assert.equal(retries.length,1);assert.ok(retries[0].endsWith('/retry'))
  assert.equal((await admin.query('SELECT status FROM survey_reminder_outbox WHERE id=$1',[outbox.id])).rows[0].status,'done')
  assert.equal((await admin.query('SELECT count(*)::int n FROM notifications WHERE id=$1',[outbox.notification_id])).rows[0].n,1);check('canonical: provider retries skip accepted and expired devices and do not duplicate in-app notifications')
  const rescheduled=await as(ids.owner,()=>service.updateScheduledJob(ids.owner,delivery.id,{version:1,starts_at:new Date(Date.now()+3*86400000).toISOString()}))
  assert.equal(rescheduled.version,2);assert.ok((await admin.query('SELECT expires_at<=NOW() expired FROM notifications WHERE id=$1',[outbox.notification_id])).rows[0].expired)
  await as(ids.owner,()=>service.updateScheduledJob(ids.owner,delivery.id,{version:2,status:'cancelled'}))
  let afterCancellation=0;await runSurveyReminderBatch({send:async()=>{afterCancellation++;return 201}})
  assert.equal(afterCancellation,0);check('canonical: rescheduling expires old alerts and cancellation stops all future delivery')
  const revoked=await as(ids.viewer,()=>service.createScheduledJob(ids.viewer,{...base,request_id:randomUUID(),reminder_minutes:[]}))
  await admin.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2',[ids.project,ids.viewer])
  await runSurveyReminderBatch({send:async()=>{throw new Error('revoked member must not receive a push')}})
  assert.equal((await admin.query('SELECT status FROM survey_reminder_outbox WHERE schedule_id=$1',[revoked.id])).rows[0].status,'cancelled')
  await as(ids.viewer,()=>service.updateScheduledJob(ids.viewer,revoked.id,{version:1,status:'cancelled'}));check('canonical: lost project access cancels delivery while permitting cancellation of retained personal history')
  const fieldJob=await as(ids.owner,()=>service.createScheduledJob(ids.owner,{...base,request_id:randomUUID()}))
  const started=await as(ids.owner,()=>service.updateScheduledJob(ids.owner,fieldJob.id,{version:1,status:'in_progress'}));assert.equal(started.status,'in_progress')
  const completed=await as(ids.owner,()=>service.updateScheduledJob(ids.owner,fieldJob.id,{version:2,status:'completed'}));assert.equal(completed.status,'completed')
  assert.equal((await as(ids.owner,()=>database.db.query('DELETE FROM job_schedule WHERE id=$1 RETURNING id',[fieldJob.id]))).rowCount,0);check('canonical: point-collection start and completion retain history and runtime hard deletion is denied')
 }finally{
  await database.getPool().end()
  Module._load=load
  if(extension)Module._extensions['.ts']=extension;else delete Module._extensions['.ts']
 }
}
