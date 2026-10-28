#!/usr/bin/env node
const declaredFixtureCrs21037 = 'EPSG:21037'
// Packaged HTTP surface workflow on the allowlisted synthetic rehearsal database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises';
import 'node:crypto';
import 'node:util';
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
assert.equal(rehearsal.database, 'metardu_runtime_verify', 'Use only the local synthetic release rehearsal database.')
const flags = process.argv.slice(2)
assert.ok(flags.every(flag => ['--registry', '--keep-browser-fixture'].includes(flag)), 'Only explicit local verification modes are accepted.')
const registryMode = flags.includes('--registry'), keepBrowserFixture = flags.includes('--keep-browser-fixture')
assert.ok(!keepBrowserFixture || registryMode, 'Browser fixtures are only available for the latest local registry preview.')
const base = registryMode ? 'http://127.0.0.1:3006' : 'http://127.0.0.1:3005', admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ownerId = randomUUID(), otherId = randomUUID(), password = `synthetic-${randomUUID()}`
const ownerEmail = `surface-http-${ownerId}@example.invalid`, otherEmail = `surface-http-${otherId}@example.invalid`
const checks = []
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
function sessionClient() {
  const cookies = new Map()
  return async (pathname, options = {}) => {
    const response = await fetch(base + pathname, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)) }
    return response
  }
}
async function login(email, id) {
  const request = sessionClient(), csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard`, json: 'true' }) })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
async function json(request, pathname, body, method = 'POST') {
  const response = await request(pathname, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok) console.log(JSON.stringify({ syntheticRequest: pathname, status: response.status, code: value.code, error: value.error }))
  return { response, value }
}
let fixturesVerified=false, projectId, registeredId
const originalId=randomUUID(),requestId=randomUUID()
await admin.connect()
try {
 await admin.query(`INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,'Synthetic core HTTP owner'),($4,$5,$3,'Synthetic core HTTP other')`,[ownerId,ownerEmail,await bcrypt.hash(password,10),otherId,otherEmail])
 await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",[ownerId,otherId]);fixturesVerified=true
 const owner=await login(ownerEmail,ownerId),other=await login(otherEmail,otherId)
 check('two real packaged password sessions work',true)
 const project=await json(owner,'/api/projects',{name:'SYNTHETIC beacon QA HTTP only',survey_type:'engineering'})
 projectId=project.value.data?.id
 check('real project creation works',project.response.status===201&&typeof projectId==='string')
 const ref=await json(owner,`/api/project/${projectId}/reference-system`,{horizontalCrs:declaredFixtureCrs21037,datum:'ARC1960',units:'metres',utmZone:37,hemisphere:'S',verticalDatum:'Synthetic BM',verticalReference:'local',distanceMode:'grid',coordinatePrecision:3},'PUT')
 check('real declared reference writes under the session',ref.response.status===200)
 await admin.query("INSERT INTO beacon_registry(id,created_by,project_id,beacon_number,easting,northing,elevation) VALUES($1,$2,$3,$4,500000,9800000,123.456789)",[originalId,ownerId,projectId,`SYN-HTTP-${originalId}`])
 const observation={requestId,projectId,easting:500000.01234,northing:9800000.05678,elevation:0,horizontalCrs:'EPSG:21037',originalHorizontalCrs:'EPSG:21037',verticalDatum:'Synthetic BM',ties:'SYN-A 12.000 m; SYN-B 18.000 m; synthetic only',instrument:'SYN-TS-HTTP',note:'Synthetic re-observation; not field evidence',observationDate:'2026-10-01T09:00:00+03:00'}
 const endpoint=`/api/beacons/${originalId}/reestablish`
 const saved=await json(owner,endpoint,observation), capture=saved.value.data?.capture
 check('packaged writer persists an observed replacement and zero height',saved.response.status===201&&capture.observation.elevation===0&&capture.predecessor_snapshot.elevation===123.456789)
 check('packaged responses remain private',saved.response.headers.get('cache-control')==='private, no-store')
 const replay=await json(owner,endpoint,observation)
 check('real HTTP replay returns the same observation capture',replay.response.status===200&&replay.value.data.replayed&&replay.value.data.capture.id===capture.id)
 check('different evidence under the same UUID conflicts',(await json(owner,endpoint,{...observation,northing:observation.northing+0.00001})).response.status===409)
 check('another actual session cannot replace the mark',(await json(other,endpoint,observation)).response.status===404)
 const historyResponse=await owner(`/api/beacons/${capture.replacement_id}/reestablish`),history=await historyResponse.json()
 check('real HTTP reload returns private immutable evidence',historyResponse.status===200&&historyResponse.headers.get('cache-control')==='private, no-store'&&history.data.captures[0].id===capture.id)
 if (registryMode) {
  const choicesResponse = await owner(`/api/beacons/projects?onlyId=${projectId}`), choices = await choicesResponse.json()
  check('packaged project selector returns only the owned declared project', choicesResponse.status === 200 && choicesResponse.headers.get('cache-control') === 'private, no-store' && choices.data.projects.length === 1 && choices.data.projects[0].horizontalCrs === declaredFixtureCrs21037)
  check('another real session cannot discover the project', (await (await other(`/api/beacons/projects?onlyId=${projectId}`)).json()).data.projects.length === 0)
  const body = { projectId, beaconNumber: `SYN-REG-HTTP-${ownerId}`, easting: 500020.01234, northing: 9800020.05678, elevation: 0, verticalDatum: 'Synthetic BM', description: 'Synthetic browser verification only' }
  const registered = await json(owner, '/api/beacons', body)
  registeredId = registered.value.data?.beacon?.id
  check('real registry form endpoint creates declared coordinates and zero height', registered.response.status === 201 && registered.value.data.beacon.horizontal_crs === declaredFixtureCrs21037 && registered.value.data.beacon.elevation === 0)
  check('duplicate registry mark conflicts', (await json(owner, '/api/beacons', body)).response.status === 409)
  check('another session cannot register on the project', (await json(other, '/api/beacons', { ...body, beaconNumber: `SYN-OTHER-${otherId}` })).response.status === 403)
  const nearResponse = await owner(`/api/beacons?q=${body.beaconNumber}&easting=500020.01234&northing=9800020.05678&crs=EPSG:21037&radius=1&limit=1`), near = await nearResponse.json()
  check('packaged proximity reader uses the declared grid and exact center', nearResponse.status === 200 && nearResponse.headers.get('cache-control') === 'private, no-store' && near.data.beacons.length === 1 && near.data.beacons[0].distance_m === 0 && near.data.beacons[0].id === registeredId && near.data.distanceMode === 'grid')
  const current = (await (await owner(`/api/beacons?q=SYN-HTTP-${originalId}`)).json()).data.beacons
  check('retired predecessor is absent from current registry results', current.every(row => row.id !== originalId) && current.some(row => row.id === capture.replacement_id))
  check('packaged proximity search rejects an omitted grid', (await owner('/api/beacons?easting=500000&northing=9800000')).status === 400)
  const audit = (await admin.query("SELECT record_id, user_id FROM audit_logs WHERE table_name='beacon_registry' AND record_id=$1", [registeredId])).rows
  check('packaged registration has a real row-linked audit actor', audit.length === 1 && audit[0].user_id === ownerId)
 }
 const qa=await json(owner,`/api/project/${projectId}/qa`,{dataRevision:'SYN-HTTP-R1',results:[{checkType:'synthetic.closure',result:'PASS',measuredValue:0.01,thresholdValue:0.02,unit:'m',details:{rule:'Absolute closure <= threshold',comparison:'lte'}}]})
 check('packaged QA writer consumes JSON and retains reported evidence',qa.response.status===201&&qa.value.data.certified===false&&qa.value.data.toleranceProfileId===null)
 const rows=(await admin.query('SELECT * FROM qa_results WHERE qa_run_id=$1',[qa.value.data.runId])).rows
 check('real QA evidence reaches PostgreSQL with its measurement and rule',Number(rows[0].measured_value)===0.01&&rows[0].details.comparison==='lte'&&rows[0].details.evidenceSource==='client_reported')
 const page=await owner('/tools/cassini-utm'),html=await page.text()
 check('packaged Cassini route renders after the typed JSON boundary change',page.status===200&&html.includes('Cassini-UTM Converter'))
} finally {
 const output = registryMode ? 'test-results/beacon-registry-http' : 'test-results/beacon-cassini-http'
 await mkdir(output,{recursive:true})
 const passed = checks.length === (registryMode ? 21 : 12) && checks.every(c=>c.passed)
 await writeFile(`${output}/result.json`,JSON.stringify({synthetic:true,base,database:rehearsal.database,passwordSessionsVerified:true,oauthVerified:false,passed,projectId,checks},null,2)+'\n')
 if (keepBrowserFixture && passed) await writeFile('.cache/release-verify/beacon-registry-browser-fixture.json', JSON.stringify({synthetic:true,base,database:rehearsal.database,ownerId,email:ownerEmail,password,projectId,registeredId},null,2)+'\n')
 if(fixturesVerified)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[keepBrowserFixture && passed ? [otherId] : [ownerId,otherId]])
 await admin.end()
}
