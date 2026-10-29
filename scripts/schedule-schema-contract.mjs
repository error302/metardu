import assert from 'node:assert/strict'
export const SCHEDULE_TABLES=['job_schedule','survey_push_subscriptions','survey_reminder_outbox','survey_push_deliveries']
export async function readScheduleSchemaContract(client,runtimeRole){
 const relations=(await client.query("SELECT c.relname name,c.relrowsecurity rls,(has_table_privilege($1,c.oid,'SELECT') AND has_table_privilege($1,c.oid,'INSERT') AND has_table_privilege($1,c.oid,'UPDATE') AND has_table_privilege($1,c.oid,'DELETE')) privileges FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($2) ORDER BY c.relname",[runtimeRole,SCHEDULE_TABLES])).rows
 const trigger=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='job_schedule' AND t.tgname='scheduled_project_binding' AND t.tgenabled='O') binding")).rows[0].binding
 const helper=(await client.query("SELECT to_regprocedure('public.survey_schedule_project_access(uuid,boolean)') IS NOT NULL available")).rows[0].available
 return {relations,trigger,helper}
}
export function assertScheduleSchemaContract(value,{pending=false}={}){
 assert.ok(Array.isArray(value.relations))
 if(pending){
  assert.equal(value.relations.length,0,'Unexpected existing scheduling schema blocks admission; retain and review it')
  assert.equal(value.trigger,false);assert.equal(value.helper,false)
  return {passed:true,pending:true}
 }
 assert.deepEqual(value.relations.map(row=>row.name).sort(),SCHEDULE_TABLES.slice().sort())
 for(const row of value.relations){assert.equal(row.rls,true,'Scheduling RLS must be enabled');assert.equal(row.privileges,true,'The restricted runtime needs ordinary scheduling table privileges')}
 assert.equal(value.trigger,true,'Project binding trigger is unavailable')
 assert.equal(value.helper,true,'Project access helper is unavailable')
 return {passed:true,pending:false,tableCount:4,rls:true,runtimePrivileges:true,projectBinding:true}
}
