import test from 'node:test'
import assert from 'node:assert/strict'
import {FIELD_COLUMNS,assertFieldObservationContract} from '../scripts/field-observation-contract.mjs'

function contract(pending=false){
  return{
    columns:Object.entries(FIELD_COLUMNS).flatMap(([table_name,names])=>Object.entries(names).map(([column_name,udt_name])=>({table_name,column_name,udt_name}))),
    privileges:Object.keys(FIELD_COLUMNS).map(name=>({name,can_read:true,can_insert:true})),
    relations:Object.keys(FIELD_COLUMNS).map(name=>({name,rls:true})),
    policies:Object.keys(FIELD_COLUMNS).flatMap(table_name=>pending?[{table_name,name:`project_child_${table_name}`,command:'*',permissive:true}]:['read','insert','update','delete'].map((action,index)=>({table_name,name:`${table_name==='survey_observations'?'field_observations':'field_photos'}_${action}`,command:['r','a','w','d'][index],permissive:true}))),
    functions:['lock_project_for_read',...(pending?[]:['field_observation_project_access'])].map(name=>({name,security_definer:true,executable:true,configuration:['search_path=pg_catalog, public']})),
    immutable:pending?[]:[{enabled:'O',function_name:'guard_receipted_field_observation'}],
  }
}
test('pre/post contracts distinguish reviewed migration work from a missing deployed safeguard',()=>{
  assertFieldObservationContract(contract(true),{pending:true})
  assertFieldObservationContract(contract())
  assert.throws(()=>assertFieldObservationContract(contract(true)))
  assert.throws(()=>assertFieldObservationContract(contract(),{pending:true}))
})
test('wrong raw columns, missing runtime privileges, disabled RLS or unsafe helper configuration reject release',()=>{
  for(const mutate of [c=>c.columns.pop(),c=>c.columns[0].udt_name='text',c=>c.privileges[0].can_insert=false,c=>c.relations[0].rls=false,c=>c.functions[0].security_definer=false,c=>c.functions[0].configuration=[],c=>c.immutable[0].enabled='D',c=>c.policies.push({table_name:'survey_observations',name:'unsafe',command:'*',permissive:true}),c=>c.columns.push({table_name:'survey_observations',column_name:'unknown_required',udt_name:'text',is_nullable:'NO',column_default:null})]){
    const value=contract();mutate(value);assert.throws(()=>assertFieldObservationContract(value))
  }
})
test('additional restrictive policies are retained and cannot weaken the permissive boundary',()=>{
  const value=contract()
  value.policies.push({table_name:'survey_observations',name:'additional_restriction',command:'*',permissive:false})
  assertFieldObservationContract(value)
})
