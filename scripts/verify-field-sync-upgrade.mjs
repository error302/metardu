// Fresh synthetic upgrade proof in the existing rehearsal PostgreSQL service.
// No customer clone, new container, edited applied migration or privilege shortcut.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {randomUUID,randomBytes} from 'node:crypto'
import pg from 'pg'
import {pinnedReleaseArguments} from './release-plan.mjs'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {migrationChecksums,computeDrift} from './verify-migrations.mjs'
import {FIELD_OBSERVATION_VERSION,readFieldObservationContract,assertFieldObservationContract} from './field-observation-contract.mjs'

const revision=process.argv[2]
const {directory}=pinnedReleaseArguments(['rehearse',revision,...process.argv.slice(3)],process.cwd())
const receipt=JSON.parse(readFileSync(join(directory,'promotion.json'),'utf8'))
assert.equal(receipt.revision,revision);assert.equal(receipt.status,'planned')
assert.equal(receipt.migrationBefore.length,118);assert.deepEqual(receipt.pending,[FIELD_OBSERVATION_VERSION])
assert.equal(existsSync(join(directory,'upgrade-checks.json')),false,'Inspect existing upgrade evidence before rerunning this pinned revision.')
const config=rehearsalDatabaseConfig(),bootstrap=new URL(config.adminUrl)
assert.equal(bootstrap.hostname,'127.0.0.1');assert.equal(bootstrap.port,'55433');assert.equal(bootstrap.pathname,'/metardu_runtime_verify')
const database='metardu_field_sync_upgrade_verify',marker='METARDU disposable field role upgrade verification'
const targetUrl=new URL(bootstrap);targetUrl.pathname='/'+database
const runtimeRole='field_upgrade_'+randomBytes(6).toString('hex'),runtimePassword=randomBytes(24).toString('hex')
const variants=['canonical','restrictive','unknown_permissive','disabled_rls']
const report={revision,status:'checking',sourceBaseline:118,pending:receipt.pending,variants:[],checks:[],customerDataCopied:false,newContainer:false,cleanup:{}}
const save=()=>writeFileSync(join(directory,'upgrade-checks.json'),JSON.stringify(report,null,2)+'\n')
const check=name=>{report.checks.push({name,passed:true});save();console.log('PASS '+name)}
const git=args=>{const r=spawnSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout}
assert.equal(git(['rev-parse','HEAD']).trim(),revision);assert.equal(git(['status','--porcelain','--untracked-files=no']).trim(),'')
const inspected=spawnSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true})
assert.equal(inspected.status,0);const fixture=JSON.parse(inspected.stdout)[0]
assert.equal(fixture.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal');assert.equal(fixture.State.Running,true)
assert.deepEqual(fixture.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const files=git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).trim().split('\n').filter(path=>path.endsWith('.sql')).sort().map(path=>{const content=git(['show',`${revision}:${path}`]);return{path,content,version:path.split('/').at(-1).slice(0,-4),...migrationChecksums(Buffer.from(content))}})
assert.equal(files.length,119)
const previous=new Set(receipt.migrationBefore.map(row=>row.version))
const stage=(name,selected)=>{
  const source=join(directory,name)
  for(const file of selected){const dest=join(source,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,file.content)}
  mkdirSync(join(source,'scripts'),{recursive:true})
  for(const script of ['migrate-unified.mjs','verify-migrations.mjs','provision-runtime-db-role.mjs'])writeFileSync(join(source,'scripts',script),git(['show',`${revision}:scripts/${script}`]))
  return source
}
const baseline=stage('field-baseline-source',files.filter(file=>previous.has(file.version))),full=stage('field-full-source',files)
const cleanEnv={...process.env}
for(const file of readdirSync('.').filter(name=>/^\.env(?:\.|$)/.test(name)))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);if(match)cleanEnv[match[1]]=''}
const env={...cleanEnv,MIGRATION_DB_HOST:'127.0.0.1',MIGRATION_DB_PORT:'55433',MIGRATION_DB_NAME:database,MIGRATION_DB_USER:decodeURIComponent(bootstrap.username),MIGRATION_DB_PASSWORD:decodeURIComponent(bootstrap.password),APP_DB_HOST:'127.0.0.1',APP_DB_PORT:'55433',APP_DB_NAME:database,APP_DB_USER:runtimeRole,APP_DB_PASSWORD:runtimePassword,DATABASE_URL:'',NODE_ENV:'production'}
const run=(source,name,expected=true)=>{
  const result=spawnSync(process.execPath,[join(source,'scripts/provision-runtime-db-role.mjs')],{cwd:source,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
  writeFileSync(join(directory,`field-${name}.log`),(result.stdout??'')+(result.stderr??''))
  if(expected)assert.equal(result.status,0,`Normal synthetic ${name} failed; inspect its log.`)
  else assert.notEqual(result.status,0,'Unsafe field permissions must reject the migration.')
  return result
}
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
let target,created=false,roleOwned=false
await admin.connect();save()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[runtimeRole])).rowCount,0)
  for(const variant of variants){
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Never overwrite an existing target.')
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);created=true
    await admin.query(`COMMENT ON DATABASE ${database} IS '${marker}'`)
    target=new pg.Client({connectionString:targetUrl.toString(),connectionTimeoutMillis:5000});await target.connect()
    roleOwned=true;run(baseline,variant+'-baseline')
    const before=(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
    assert.equal(before.length,118);assert.ok(computeDrift(files.filter(f=>previous.has(f.version)),before).ok)
    const owner=randomUUID(),project=randomUUID()
    await target.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC field upgrade')",[owner,`${owner}@example.invalid`])
    await target.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC field upgrade - NOT FIELD EVIDENCE','engineering')",[project,owner])
    await target.query("INSERT INTO survey_observations(project_id,client_id,point_name,observation_type,easting,northing,elevation,notes,observed_at) VALUES($1,'historical-zero','SYNTHETIC zero','manual',0,0,0,'café historical raw','2020-01-02T03:04:05Z'),($1,'historical-null','SYNTHETIC unknown','manual',NULL,NULL,NULL,NULL,NULL)",[project])
    await target.query("INSERT INTO field_photos(project_id,client_id,storage_path,metadata) VALUES($1,'historical-photo','synthetic-no-file/retained',NULL)",[project])
    if(variant==='restrictive')await target.query('CREATE POLICY qa_extra_field_restriction ON survey_observations AS RESTRICTIVE FOR ALL USING(true) WITH CHECK(true)')
    if(variant==='unknown_permissive')await target.query('CREATE POLICY qa_unreviewed_field_access ON survey_observations FOR ALL USING(true) WITH CHECK(true)')
    if(variant==='disabled_rls')await target.query('ALTER TABLE survey_observations DISABLE ROW LEVEL SECURITY')
    const snapshot=async()=>{
      const rows=[]
      for(const table of ['survey_observations','field_photos'])rows.push((await target.query(`SELECT '${table}' name,count(*)::int n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM ${table} t`)).rows[0])
      return rows
    }
    const original=await snapshot(),priorContract=await readFieldObservationContract(target,runtimeRole)
    if(['unknown_permissive','disabled_rls'].includes(variant)){
      assert.throws(()=>assertFieldObservationContract(priorContract,{pending:true}))
      const rejected=run(full,variant+'-forward',false)
      assert.match(rejected.stdout+rejected.stderr,variant==='unknown_permissive'?/Unexpected field-record policy/:/Field-record RLS must already be enabled/)
      assert.deepEqual((await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,before)
      assert.deepEqual(await readFieldObservationContract(target,runtimeRole),priorContract)
      report[variant==='unknown_permissive'?'unsafePoliciesRejected':'disabledRlsRejected']=true
      check(`${variant}: normal runner rejects atomically with original policies, ledger and rows intact`)
    }else{
      const prior=assertFieldObservationContract(priorContract,{pending:true})
      run(full,variant+'-forward')
      const after=(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
      assert.equal(after.length,119);assert.ok(computeDrift(files,after).ok)
      assert.deepEqual(after.filter(row=>previous.has(row.version)),before)
      const next=assertFieldObservationContract(await readFieldObservationContract(target,runtimeRole))
      assert.equal(next.restrictivePolicyHash,prior.restrictivePolicyHash)
      const native=spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath','tests/field-sync.rollback.native.test.ts'],{cwd:process.cwd(),env:{...cleanEnv,NODE_ENV:'test',DATABASE_URL:targetUrl.toString(),TEST_ADMIN_DATABASE_URL:targetUrl.toString(),AUTH_SECRET:'synthetic-field-upgrade-only',METARDU_FIELD_SYNC_ROLLBACK:'normal-upgrade',QA_FIELD_RUNTIME:runtimeRole,QA_FIELD_VARIANT:variant},encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
      writeFileSync(join(directory,`field-${variant}-native.log`),(native.stdout??'')+(native.stderr??''));assert.equal(native.status,0,`Native ${variant} verification failed; inspect its log.`)
      const nativeReport=JSON.parse(readFileSync(`.cache/field-sync/upgrade-native-${variant}.json`,'utf8'));assert.equal(nativeReport.status,'passed');assert.equal(nativeReport.cleanup,true);assert.ok(nativeReport.checks.length>=10)
      report.restrictivePoliciesPreserved=true;report.nativeServiceVerified=true;report.rawSchemaContractVerified=true;report.targetLedgerCount=after.length
      check(`${variant}: normal 118-to-119 upgrade preserves all historical hashes and restrictive policies`)
      check(`${variant}: real restricted-role raw delivery, replay, personal/firm roles, revocation and immutability pass`)
    }
    assert.deepEqual(await snapshot(),original)
    check(`${variant}: historical raw observations/photo metadata and NULL/zero/timestamps are unchanged`)
    report.variants.push(variant);save()
    await target.end();target=null
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[database])).rows[0].marker,marker)
    await admin.query(`DROP DATABASE ${database}`);created=false
  }
  Object.assign(report,{originalValuesPreserved:true,historicalHashesPreserved:true,normalRuntimeProvisioning:true,status:'passed'})
}catch(error){report.status='failed';report.failure=error.message;throw error}
finally{
  if(target)await target.end()
  if(created){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[database])).rows[0]?.marker,marker);await admin.query(`DROP DATABASE ${database}`)}
  report.cleanup.syntheticDatabaseRemoved=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===0
  if(roleOwned){await admin.query(`DROP ROLE "${runtimeRole}"`);report.cleanup.syntheticRoleRemoved=true}
  await admin.end();save()
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,variants:report.variants,cleanup:report.cleanup}))
