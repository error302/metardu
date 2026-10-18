import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

export const FIELD_OBSERVATION_VERSION='114_field_observation_roles'
const common={id:'uuid',project_id:'uuid',client_id:'text',point_id:'text',point_name:'varchar',synced_at:'timestamptz',created_at:'timestamptz'}
export const FIELD_COLUMNS={
  survey_observations:{...common,observation_type:'varchar',...Object.fromEntries(['northing','easting','elevation','latitude','longitude','accuracy','hdop','vdop','pdop','instrument_height','rod_height','horizontal_angle','vertical_angle','slope_distance','temperature','pressure','humidity'].map(name=>[name,'float8'])),satellites:'int4',fix_quality:'int2',...Object.fromEntries(['solution_type','backsight','foresight','weather','horizontal_crs','vertical_datum','accuracy_source','instrument_name','observation_source'].map(name=>[name,'varchar'])),notes:'text',observed_at:'timestamptz'},
  field_photos:{...common,observation_client_id:'text',storage_path:'text',filename:'varchar',mime_type:'varchar',caption:'text',orientation:'varchar',captured_at:'timestamptz',metadata:'jsonb'},
}
const tables=Object.keys(FIELD_COLUMNS)
export async function readFieldObservationContract(client,runtimeRole){
  const columns=(await client.query("SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables])).rows
  const privileges=(await client.query("SELECT name,has_table_privilege($1,'public.'||name,'SELECT') can_read,has_table_privilege($1,'public.'||name,'INSERT') can_insert FROM unnest($2::text[]) name",[runtimeRole,tables])).rows
  const relations=(await client.query("SELECT c.relname name,c.relrowsecurity rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows
  const policies=(await client.query("SELECT c.relname table_name,p.polname name,p.polpermissive permissive,p.polcmd command,pg_get_expr(p.polqual,p.polrelid) using_expression,pg_get_expr(p.polwithcheck,p.polrelid) check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,p.polname",[tables])).rows
  const functions=(await client.query("SELECT p.proname name,p.prosecdef security_definer,p.proconfig configuration,has_function_privilege($1,p.oid,'EXECUTE') executable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.oid IN (to_regprocedure('public.lock_project_for_read(uuid)'),to_regprocedure('public.field_observation_project_access(uuid,boolean)'))",[runtimeRole])).rows
  const immutable=(await client.query("SELECT t.tgenabled enabled,p.proname function_name FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.survey_observations'::regclass AND t.tgname='receipted_field_observation_immutable' AND NOT t.tgisinternal")).rows
  return{columns,privileges,relations,policies,functions,immutable}
}

export function assertFieldObservationContract(contract,{pending=false}={}){
  for(const [table,expected]of Object.entries(FIELD_COLUMNS)){
    for(const [name,type]of Object.entries(expected))assert.equal(contract.columns.find(c=>c.table_name===table&&c.column_name===name)?.udt_name,type,`Unexpected raw-field column: ${table}.${name}`)
    for(const column of contract.columns.filter(c=>c.table_name===table&&!Object.hasOwn(expected,c.column_name)))assert.ok(column.is_nullable==='YES'||column.column_default!==null,`Unsupported mandatory raw-field column: ${table}.${column.column_name}`)
    assert.equal(contract.relations.find(r=>r.name===table)?.rls,true,`Field-record RLS must be enabled: ${table}`)
    const access=contract.privileges.find(p=>p.name===table)
    assert.ok(access?.can_read&&access.can_insert,`Runtime raw-field privileges missing: ${table}`)
    const allowed=pending?[[`project_child_${table}`,'*']]:['read','insert','update','delete'].map((name,index)=>[`${table==='survey_observations'?'field_observations':'field_photos'}_${name}`,['r','a','w','d'][index]])
    const permissive=contract.policies.filter(p=>p.table_name===table&&p.permissive)
    assert.equal(permissive.length,allowed.length,`Unexpected field-record policy count: ${table}`)
    for(const [name,command]of allowed)assert.ok(permissive.some(p=>p.name===name&&p.command===command),`Unexpected field-record policy: ${table}.${name}`)
  }
  for(const name of pending?['lock_project_for_read']:['lock_project_for_read','field_observation_project_access']){
    const helper=contract.functions.find(f=>f.name===name)
    assert.ok(helper?.security_definer&&helper.executable,`Missing bounded raw-field helper: ${name}`)
    assert.ok(helper.configuration?.includes('search_path=pg_catalog, public'),`Unexpected raw-field helper search path: ${name}`)
  }
  if(!pending)assert.ok(contract.immutable.length===1&&contract.immutable[0].enabled==='O'&&contract.immutable[0].function_name==='guard_receipted_field_observation','Raw capture immutability trigger is missing or disabled.')
  const restrictivePolicyHash=createHash('sha256').update(JSON.stringify(contract.policies.filter(p=>!p.permissive))).digest('hex')
  return{passed:true,pending,rawColumns:true,rls:true,runtimePrivileges:true,policies:true,immutable:!pending,restrictivePolicyHash}
}
