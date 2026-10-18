// Pinned source-only HTTP/SQL proof on the one existing marked preview/test DB.
// No production connection, customer clone, new container, email or payment.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {migrationChecksums,computeDrift} from './verify-migrations.mjs'

const revision=process.argv[2],apply=process.argv[3]==='--apply-synthetic-migration'
assert.match(revision??'',/^[a-f0-9]{40}$/);assert.ok(process.argv.length===3||(apply&&process.argv.length===4))
const directory=resolve('.cache/field-sync'),base='http://127.0.0.1:3021',config=rehearsalDatabaseConfig()
assert.equal(config.database,'metardu_runtime_verify');assert.equal(new URL(config.adminUrl).hostname,'127.0.0.1');assert.equal(new URL(config.adminUrl).port,'55433')
mkdirSync(directory,{recursive:true})
let attempt=1;while(existsSync(join(directory,`http-attempt-${attempt}.json`)))attempt++
const reportPath=join(directory,`http-attempt-${attempt}.json`)
const report={revision,base,status:'checking',checks:[],cleanup:{},productionChanged:false,customerDataCopied:false,newContainer:false,emailSent:false}
const save=()=>{writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');writeFileSync(join(directory,'http-current.json'),JSON.stringify({attempt,file:reportPath,status:report.status},null,2)+'\n')}
const check=(name,condition=true)=>{assert.ok(condition,name);report.checks.push({name,passed:true});save();console.log('PASS '+name)}
const git=args=>{const r=spawnSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout}
assert.equal(git(['rev-parse','HEAD']).trim(),revision);assert.equal(git(['status','--porcelain','--untracked-files=no']).trim(),'','Pin a clean tracked source before native verification.')
const inspect=spawnSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true});assert.equal(inspect.status,0)
const fixture=JSON.parse(inspect.stdout)[0]
assert.equal(fixture.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal')
assert.deepEqual(fixture.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const files=git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).trim().split('\n').filter(path=>path.endsWith('.sql')).sort().map(path=>{const content=git(['show',`${revision}:${path}`]);return{path,content,version:path.split('/').at(-1).slice(0,-4),...migrationChecksums(Buffer.from(content))}})
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
const owner=randomUUID(),other=randomUUID(),project=randomUUID(),secondProject=randomUUID(),password=randomBytes(32).toString('base64url')
const label='SYNTHETIC raw field HTTP acceptance',captureIds=[],triggers=[]
const triggerPrefix='qa_field_'+randomUUID().replaceAll('-','')
report.fixtures={users:[owner,other],projects:[project,secondProject],captureIds}
report.faultInjectionPrefix=triggerPrefix
const actor=()=>{
  const cookies=new Map()
  return async(path,{body,form=false}={})=>{
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',redirect:'manual',signal:AbortSignal.timeout(60000),headers:{Origin:base,...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},...(body===undefined?{}:{body:form?new URLSearchParams(body).toString():JSON.stringify(body)})})
    for(const item of response.headers.getSetCookie()){const pair=item.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
    return {response,data:await response.json().catch(()=>null)}
  }
}
const login=async id=>{
  const request=actor(),csrf=await request('/api/auth/csrf');assert.ok(csrf.data?.csrfToken)
  await request('/api/auth/callback/credentials',{form:true,body:{csrfToken:csrf.data.csrfToken,email:`field-${id}@example.invalid`,password,callbackUrl:base+'/fieldbook',json:'true'}})
  assert.equal((await request('/api/auth/session')).data?.user?.id,id);return request
}
const input=(id,projectId=project)=>({id,projectId,surveyType:'traverse',station:'SYN-STN',pointId:'SYN-P1',easting:0,northing:10,elevation:0,horizontalDistance:0,bearingDeg:0,bearingMin:0,bearingSec:0,notes:'SYNTHETIC raw source; not field evidence',createdAt:'2026-10-18T08:00:00.000Z',syncedAt:null})
const rows=async(id=project)=>(await admin.query(`SELECT
  (SELECT count(*)::int FROM survey_observations WHERE project_id=$1) observations,
  (SELECT count(*)::int FROM observation_batches WHERE project_id=$1) captures,
  (SELECT count(*)::int FROM survey_points WHERE project_id=$1) reviewed_points`,[id])).rows[0]
const sourceFingerprints=async()=>{
  const records=[]
  for(const table of ['survey_observations','field_photos','observation_batches'])records.push((await admin.query(`SELECT '${table}' name,count(*)::int n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM ${table} t`)).rows[0])
  return records
}
const failedRows=async id=>(await admin.query("SELECT (SELECT count(*)::int FROM survey_observations WHERE project_id=$1 AND client_id=$2) observations,(SELECT count(*)::int FROM observation_batches WHERE project_id=$1 AND quality_metadata->'raw'->>'id'=$2) captures",[project,id])).rows[0]
let created=false
await admin.connect();save()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  const role=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[config.runtimeRole])).rows[0]
  assert.ok(role&&!role.rolsuper&&!role.rolbypassrls)
  const before=(await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  const sourceRecordsBefore=await sourceFingerprints()
  const drift=computeDrift(files,before);assert.equal(drift.mutated.length,0);assert.equal(drift.ghost.length,0)
  assert.ok(drift.missing.length===0||(drift.missing.length===1&&drift.missing[0]==='114_field_observation_roles'))
  if(drift.missing.length){
    assert.ok(apply,'The reviewed pending migration requires --apply-synthetic-migration.')
    const staging=join(directory,'migration-source',revision)
    for(const file of files){const dest=join(staging,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,file.content)}
    mkdirSync(join(staging,'scripts'),{recursive:true})
    for(const name of ['migrate-unified.mjs','verify-migrations.mjs'])writeFileSync(join(staging,'scripts',name),git(['show',`${revision}:scripts/${name}`]))
    const migration=spawnSync(process.execPath,[join(staging,'scripts/migrate-unified.mjs')],{cwd:staging,env:{...process.env,DATABASE_URL:config.adminUrl},encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
    writeFileSync(join(directory,`migration-${revision}.log`),(migration.stdout??'')+(migration.stderr??''));assert.equal(migration.status,0,'Normal synthetic migration failed; inspect its log.')
  }
  const ledger=(await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  assert.ok(computeDrift(files,ledger).ok);assert.ok(before.every(row=>ledger.some(after=>after.version===row.version&&after.checksum===row.checksum)))
  assert.deepEqual(await sourceFingerprints(),sourceRecordsBefore)
  report.syntheticMigration={normalRunner:drift.missing.length>0,sourceRegistryMatches:true,manualPrivilegeGrants:false,applied:ledger.length,priorHashesPreserved:true,originalRecordsPreserved:true,pendingBefore:drift.missing}
  check(drift.missing.length?'pinned normal synthetic migration preserves original records and all prior checksums':'pinned source matches the existing complete synthetic registry; original records are unchanged')
  await admin.query('BEGIN')
  const passwordHash=await bcrypt.hash(password,10)
  for(const id of [owner,other]){
    await admin.query("INSERT INTO users(id,email,password_hash,full_name,email_verified) VALUES($1,$2,$3,$4,true)",[id,`field-${id}@example.invalid`,passwordHash,label])
    await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id])
  }
  for(const id of [project,secondProject])await admin.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,$3,'engineering')",[id,owner,label])
  await admin.query('COMMIT');created=true
  const owned=await login(owner),foreign=await login(other),path='/api/fieldbook/sync'
  check('both exact disposable accounts authenticate through ordinary source credential sessions')
  check('anonymous raw delivery requires sign-in',(await actor()(path,{body:input('anonymous')})).response.status===401)
  check('another account cannot deliver to a known private project',(await foreign(path,{body:input('foreign')})).response.status===404)
  const firstId='source-'+randomUUID();captureIds.push(firstId);save()
  const first=await owned(path,{body:input(firstId)})
  assert.equal(first.response.status,201,JSON.stringify(first.data))
  check('source HTTP returns exact observation and capture IDs with unverified raw authority',first.data?.ok===true&&first.data.id===firstId&&/^[a-f0-9-]{36}$/.test(first.data.observationId)&&/^[a-f0-9-]{36}$/.test(first.data.batchId)&&first.data.fieldVerified===false)
  check('source receipt is private and cannot be share-cached',first.response.headers.get('cache-control')==='private, no-store')
  const stored=(await admin.query('SELECT * FROM survey_observations WHERE id=$1',[first.data.observationId])).rows[0]
  const batch=(await admin.query('SELECT * FROM observation_batches WHERE id=$1',[first.data.batchId])).rows[0]
  check('actual SQL preserves zero readings and unknown CRS without creating reviewed points',stored.easting===0&&stored.elevation===0&&stored.horizontal_crs===null&&(await rows()).reviewed_points===0)
  check('the immutable archive retains fields with no observation-table column',batch.quality_metadata.raw.horizontalDistance===0&&batch.quality_metadata.raw.bearingDeg===0&&batch.quality_metadata.capturedBy===null&&batch.quality_metadata.uploadedBy===owner&&batch.point_count===0&&batch.observation_count===1)
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value
  const original=input(firstId);delete original.syncedAt
  check('receipt content hash independently matches the submitted original raw reading',first.data.inputHash===createHash('sha256').update(JSON.stringify(sorted(original))).digest('hex'))
  const retries=await Promise.all([owned(path,{body:input(firstId)}),owned(path,{body:{...input(firstId),syncError:'previous network failure'}})])
  check('concurrent retries replay one exact durable capture',retries.every(r=>r.response.status===200&&r.data.replayed===true&&r.data.batchId===first.data.batchId&&r.data.observationId===first.data.observationId))
  check('changed raw content cannot reuse its delivery ID',(await owned(path,{body:{...input(firstId),elevation:undefined}})).response.status===409)
  const unknownId='unknown-'+randomUUID();captureIds.push(unknownId);save()
  const unknown=await owned(path,{body:{...input(unknownId),pointId:'SYN-UNKNOWN',elevation:undefined}})
  check('an omitted elevation remains actual SQL NULL',unknown.response.status===201&&(await admin.query('SELECT elevation FROM survey_observations WHERE id=$1',[unknown.data.observationId])).rows[0].elevation===null)
  check('an incomplete coordinate pair is refused before delivery',(await owned(path,{body:{...input('incomplete'),northing:undefined}})).response.status===422)
  await admin.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer')",[project,other])
  check('a project viewer still cannot record raw captures',(await foreign(path,{body:input('viewer')})).response.status===403)
  await admin.query("UPDATE project_members SET role='surveyor' WHERE project_id=$1 AND user_id=$2",[project,other])
  const crewId='crew-'+randomUUID();captureIds.push(crewId);save()
  const crew=await foreign(path,{body:input(crewId)})
  check('a personal project surveyor can record through the same real endpoint',crew.response.status===201)
  check('a different uploader cannot take over an existing device delivery',(await foreign(path,{body:input(firstId)})).response.status===409)
  const repeated=await owned(path,{body:input(firstId,secondProject)})
  check('device delivery keys are scoped to the exact project',repeated.response.status===201&&repeated.data.batchId!==first.data.batchId)

  const legacyId='legacy-'+randomUUID();captureIds.push(legacyId)
  await admin.query("INSERT INTO survey_observations(project_id,client_id,point_name,observation_type,easting,northing,elevation) VALUES($1,$2,'SYNTHETIC legacy','manual',0,0,NULL)",[project,legacyId])
  const legacyBefore=(await admin.query('SELECT to_jsonb(t) value FROM survey_observations t WHERE project_id=$1 AND client_id=$2',[project,legacyId])).rows[0].value
  check('an old unreceipted record is retained for review',(await owned(path,{body:input(legacyId)})).response.status===409)
  assert.deepEqual((await admin.query('SELECT to_jsonb(t) value FROM survey_observations t WHERE project_id=$1 AND client_id=$2',[project,legacyId])).rows[0].value,legacyBefore)
  check('legacy source values stay byte-for-byte equivalent after refusal')

  for(const [index,table]of ['survey_observations','observation_batches','audit_logs'].entries()){
    const id='failure-'+randomUUID(),name=triggerPrefix+'_'+index
    captureIds.push(id);save()
    const condition=table==='survey_observations'?`NEW.project_id='${project}'::uuid AND NEW.client_id='${id}'`:table==='observation_batches'?`NEW.project_id='${project}'::uuid AND NEW.quality_metadata #>> '{raw,id}'='${id}'`:`NEW.table_name='survey_observations' AND NEW.details->>'projectId'='${project}' AND NEW.details->>'clientId'='${id}'`
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RETURN NULL; END IF; RETURN NEW; END $$`)
    await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`)
    const identity=(await admin.query('SELECT oid,tgfoid FROM pg_trigger WHERE tgname=$1 AND tgrelid=$2::regclass',[name,table])).rows[0];triggers.push({name,table,identity})
    const failed=await owned(path,{body:input(id)})
    check(`silent ${table} write cannot acknowledge or leave a partial capture`,!failed.response.ok)
    assert.deepEqual(await failedRows(id),{observations:0,captures:0})
  }
  await admin.query('BEGIN')
  let immutable=false
  try{await admin.query("UPDATE survey_observations SET notes='SYNTHETIC forbidden rewrite' WHERE id=$1",[first.data.observationId])}catch(error){immutable=error.code==='23514'}
  finally{await admin.query('ROLLBACK')}
  check('the native database rejects rewriting a receipted raw source',immutable)
  assert.deepEqual((await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,ledger)
  check('HTTP verification changes no applied migration record or historical hash')
  report.status='passed'
}catch(error){report.status='failed';report.failure=error.message;throw error}
finally{
  await admin.query('ROLLBACK').catch(()=>{})
  try{
    for(const {name,table,identity}of triggers){
      assert.deepEqual((await admin.query('SELECT oid,tgfoid FROM pg_trigger WHERE tgname=$1 AND tgrelid=$2::regclass',[name,table])).rows[0],identity)
      await admin.query(`DROP TRIGGER ${name} ON ${table}`);await admin.query(`DROP FUNCTION ${name}()`)
    }
    report.cleanup.exactFaultInjectionRemoved=true
    if(created){
      const actors=(await admin.query('SELECT id,email,full_name FROM users WHERE id=ANY($1::uuid[])',[[owner,other]])).rows
      assert.equal(actors.length,2);assert.ok(actors.every(r=>r.full_name===label&&r.email===`field-${r.id}@example.invalid`))
      await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[owner,other]])
      const projects=(await admin.query('SELECT id,user_id,name FROM projects WHERE id=ANY($1::uuid[])',[[project,secondProject]])).rows
      assert.equal(projects.length,2);assert.ok(projects.every(r=>r.user_id===owner&&r.name===label))
      const captures=(await admin.query('SELECT id,created_by,quality_metadata FROM observation_batches WHERE project_id=ANY($1::uuid[])',[[project,secondProject]])).rows
      assert.ok(captures.every(r=>[owner,other].includes(r.created_by)&&r.quality_metadata?.kind==='offline_field_observation'&&captureIds.includes(r.quality_metadata.raw?.id)))
      await admin.query("DELETE FROM observation_batches WHERE project_id=ANY($1::uuid[]) AND created_by=ANY($2::uuid[]) AND quality_metadata->>'kind'='offline_field_observation'",[[project,secondProject],[owner,other]])
      assert.equal((await admin.query('DELETE FROM projects WHERE id=ANY($1::uuid[]) AND user_id=$2 AND name=$3 RETURNING id',[[project,secondProject],owner,label])).rowCount,2)
      assert.equal((await admin.query('DELETE FROM users WHERE id=ANY($1::uuid[]) AND full_name=$2 RETURNING id',[[owner,other],label])).rowCount,2)
      assert.deepEqual(await rows(),{observations:0,captures:0,reviewed_points:0});assert.deepEqual(await rows(secondProject),{observations:0,captures:0,reviewed_points:0})
      report.cleanup.exactFixturesRemoved=true
    }
  }catch(error){report.status='cleanup-failed';report.cleanup.failure=error.message;throw error}
  finally{await admin.end();save()}
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,cleanup:report.cleanup,sourceOnly:true,report:reportPath}))
