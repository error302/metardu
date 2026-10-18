import test from 'node:test'
import assert from 'node:assert/strict'
import {assertImportSchemaContract,OBSERVATION_EXTENSION_TYPES,IMPORT_REQUIRED_COLUMNS} from '../scripts/import-schema-contract.mjs'
const contract=({missing=false,wrong=false}={})=>({geometry:'geometry(Point,4326)',privileges:Object.keys(IMPORT_REQUIRED_COLUMNS).map(name=>({name,can_read:name!=='audit_logs',can_insert:true,can_return_id:true})),columns:Object.entries(IMPORT_REQUIRED_COLUMNS).flatMap(([table,names])=>names.filter(name=>!(missing&&table==='observation_batches'&&Object.hasOwn(OBSERVATION_EXTENSION_TYPES,name))).map(name=>({table_name:table,column_name:name,udt_name:wrong&&name==='quality_metadata'?'text':OBSERVATION_EXTENSION_TYPES[name]?.[0]??'text'})))})
test('only the reviewed pending extension permits known missing observation fields',()=>{
  const old=contract({missing:true})
  assert.throws(()=>assertImportSchemaContract(old))
  assert.equal(assertImportSchemaContract(old,{allowPendingObservationExtension:true}).pendingObservationColumns.length,13)
  assert.equal(assertImportSchemaContract(contract()).passed,true)
  assert.throws(()=>assertImportSchemaContract({...old,columns:old.columns.filter(c=>c.table_name!=='survey_points'||c.column_name!=='easting')},{allowPendingObservationExtension:true}))
})
test('an incompatible existing type, guessed geometry or missing audit permission blocks release',()=>{
  assert.throws(()=>assertImportSchemaContract(contract({wrong:true}),{allowPendingObservationExtension:true}))
  assert.throws(()=>assertImportSchemaContract({...contract(),geometry:'geometry(Point,3857)'}))
  const denied=contract();denied.privileges.at(-1).can_return_id=false
  assert.throws(()=>assertImportSchemaContract(denied))
})
