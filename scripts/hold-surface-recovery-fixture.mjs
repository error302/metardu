// A bounded row lock for real browser interruption QA. Never changes row data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import pg from 'pg'
assert.equal(process.argv.length,2)
const fixture=JSON.parse(readFileSync('.cache/topographic/isolated-browser.json','utf8'))
assert.equal(fixture.userId,'99f15c47-7a36-43c4-b98c-1171da777039');assert.equal(fixture.projectId,'474f92f6-0e90-4129-83fb-d514db596876');assert.equal(fixture.sourceOnly,true)
const info=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',timeout:30000,windowsHide:true}))
assert.equal(info.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(info.Purpose,'schema-rehearsal');assert.deepEqual(info.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const client=new pg.Client({connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:5000,application_name:'metardu-owned-browser-surface-hold'})
await client.connect()
let timer
try{
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  await client.query('BEGIN');await client.query("SET LOCAL idle_in_transaction_session_timeout='100s'")
  const row=(await client.query('SELECT id,user_id,name FROM projects WHERE id=$1 FOR UPDATE',[fixture.projectId])).rows[0]
  assert.equal(row.user_id,fixture.userId);assert.equal(row.name,fixture.projectName)
  console.log(JSON.stringify({state:'holding',projectId:row.id,backendPid:(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid,noRowMutation:true,maximumSeconds:75}))
  process.stdin.resume()
  await new Promise(resolve=>{timer=setTimeout(resolve,75000);process.stdin.once('data',resolve)})
  await client.query('ROLLBACK');console.log(JSON.stringify({state:'released',noRowMutation:true}))
}finally{clearTimeout(timer);await client.query('ROLLBACK').catch(()=>{});await client.end();process.stdin.pause()}
