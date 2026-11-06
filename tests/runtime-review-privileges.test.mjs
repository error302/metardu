import test from 'node:test'
import assert from 'node:assert/strict'
import {grantRuntimePrivileges} from '../scripts/provision-runtime-db-role.mjs'
for(const exists of [true,false])test(`runtime grant compatibility with review table ${exists?'present':'absent'}`,async()=>{
  const calls=[]
  const client={query:async(sql)=>{
    calls.push(sql)
    if(sql.includes("rolname = 'authenticated'"))return{rows:[{rolsuper:false,rolbypassrls:false}],rowCount:1}
    if(sql.includes("to_regclass('public.surface_source_reviews')"))return{rows:[{relation:exists?'surface_source_reviews':null}],rowCount:1}
    return{rows:[],rowCount:0}
  }}
  await grantRuntimePrivileges(client,'test_migrator','test_runtime','test_database')
  const restriction=calls.findIndex(sql=>sql.includes('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.surface_source_reviews'))
  if(exists){
    assert.ok(restriction>calls.findIndex(sql=>sql.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES')))
    assert.ok(calls[restriction].includes('FROM "test_runtime"'))
    assert.equal(calls.slice(restriction+1).some(sql=>sql.startsWith('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES')),false)
  }else assert.equal(restriction,-1)
})
