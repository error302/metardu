import assert from 'node:assert/strict'

export const OBSERVATION_COMPATIBILITY_VERSION='113_observation_batch_compatibility'
export const OBSERVATION_EXTENSION_TYPES={
  source_file_name:['text','varchar'],source_file_size:['int4'],operator:['text','varchar'],
  instrument_id:['uuid'],instrument_name:['text','varchar'],station:['text','varchar'],backsight:['text','varchar'],
  instrument_height:['numeric'],target_height:['numeric'],prism_constant:['numeric'],
  quality_metadata:['jsonb'],point_count:['int4'],observation_count:['int4'],
}
export const IMPORT_REQUIRED_COLUMNS={
  import_sessions:['id','project_id','file_name','format','row_count','status'],
  survey_points:['id','project_id','point_name','easting','northing','elevation','code','is_control','source','horizontal_crs','vertical_datum','datum','projection','utm_zone','hemisphere','observer_id','import_session_id','confidence_level','geom','deleted_at'],
  observation_batches:['id','project_id','batch_number','source_type','source_file_hash','source_crs','crew','instrument_serial','notes','status','created_by','created_at','updated_at',...Object.keys(OBSERVATION_EXTENSION_TYPES)],
  audit_logs:['id','action','table_name','record_id','user_id','details','ip_address','created_at'],
}
export async function readImportSchemaContract(client,runtimeRole){
  const tables=Object.keys(IMPORT_REQUIRED_COLUMNS)
  const columns=(await client.query("SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables])).rows
  const privileges=(await client.query("SELECT name,has_table_privilege($1,'public.'||name,'SELECT') can_read,has_column_privilege($1,'public.'||name,'id','SELECT') can_return_id,has_table_privilege($1,'public.'||name,'INSERT') can_insert FROM unnest($2::text[]) name",[runtimeRole,tables])).rows
  const geometry=(await client.query("SELECT format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid='public.survey_points'::regclass AND attname='geom'")).rows[0]?.type
  return {columns,privileges,geometry}
}
export function assertImportSchemaContract(contract,{allowPendingObservationExtension=false}={}){
  const pending=[]
  for(const [table,names]of Object.entries(IMPORT_REQUIRED_COLUMNS))for(const name of names){
    const column=contract.columns.find(c=>c.table_name===table&&c.column_name===name)
    if(!column){
      assert.ok(table==='observation_batches'&&Object.hasOwn(OBSERVATION_EXTENSION_TYPES,name)&&allowPendingObservationExtension,`Missing import contract column: ${table}.${name}`)
      pending.push(name);continue
    }
    if(table==='observation_batches'&&Object.hasOwn(OBSERVATION_EXTENSION_TYPES,name))assert.ok(OBSERVATION_EXTENSION_TYPES[name].includes(column.udt_name),`Unexpected import contract type: ${table}.${name}`)
  }
  assert.equal(contract.geometry,'geometry(Point,4326)','The display geometry contract must be declared, never guessed.')
  for(const table of Object.keys(IMPORT_REQUIRED_COLUMNS)){
    const access=contract.privileges.find(p=>p.name===table)
    assert.ok(access?.can_insert&&(table==='audit_logs'?access.can_return_id:access.can_read),`Runtime import privileges are missing for ${table}.`)
  }
  return {passed:true,pendingObservationColumns:pending,geometry:contract.geometry,runtimePrivileges:true}
}
