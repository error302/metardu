// Four schema-only synthetic histories in the existing rehearsal service. No
// customer data, new container, manual privilege shortcut or applied SQL edit.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID,randomBytes} from 'node:crypto'
import pg from 'pg'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {pinnedReleaseArguments} from './release-plan.mjs'
import {migrationChecksums,computeDrift} from './verify-migrations.mjs'
import {readImportSchemaContract,assertImportSchemaContract,OBSERVATION_COMPATIBILITY_VERSION} from './import-schema-contract.mjs'

const revision=process.argv[2]
const {directory}=pinnedReleaseArguments(['rehearse',revision,...process.argv.slice(3)],process.cwd())
const receipt=JSON.parse(readFileSync(join(directory,'promotion.json'),'utf8'))
assert.equal(receipt.revision,revision);assert.equal(receipt.status,'planned')
assert.equal(receipt.migrationBefore.length,117);assert.deepEqual(receipt.pending,[OBSERVATION_COMPATIBILITY_VERSION])
const config=rehearsalDatabaseConfig(),bootstrap=new URL(config.adminUrl)
assert.equal(bootstrap.hostname,'127.0.0.1');assert.equal(bootstrap.port,'55433');assert.equal(bootstrap.pathname,'/metardu_runtime_verify')
const database='metardu_observation_upgrade_verify',marker='METARDU disposable observation compatibility verification'
const targetUrl=new URL(bootstrap);targetUrl.pathname='/'+database
const runtimeRole='obs_upgrade_'+randomBytes(6).toString('hex'),runtimePassword=randomBytes(24).toString('hex')
const runtimeUrl=new URL(targetUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword
const report={revision,status:'checking',sourceBaseline:117,pending:receipt.pending,variants:[],checks:[],customerDataCopied:false,newContainer:false,cleanup:{}}
const save=()=>writeFileSync(join(directory,'upgrade-checks.json'),JSON.stringify(report,null,2)+'\n')
const check=name=>{report.checks.push({name,passed:true});save();console.log('PASS '+name)}
const git=args=>{const r=spawnSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout}
assert.equal(git(['rev-parse','HEAD']).trim(),revision)
assert.equal(git(['status','--porcelain','--untracked-files=no']).trim(),'')
const docker=spawnSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true})
assert.equal(docker.status,0);const fixture=JSON.parse(docker.stdout)[0]
assert.equal(fixture.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal');assert.equal(fixture.State.Running,true)
assert.deepEqual(fixture.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const files=git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).trim().split('\n').filter(path=>path.endsWith('.sql')).sort().map(path=>{const content=git(['show',`${revision}:${path}`]);return{path,content,version:path.split('/').at(-1).slice(0,-4),...migrationChecksums(Buffer.from(content))}})
const previous=new Set(receipt.migrationBefore.map(row=>row.version))
assert.equal(files.length,118)
const stage=(name,selected)=>{
  const source=join(directory,name)
  for(const file of selected){const dest=join(source,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,file.content)}
  mkdirSync(join(source,'scripts'),{recursive:true})
  for(const script of ['migrate-unified.mjs','verify-migrations.mjs','provision-runtime-db-role.mjs'])writeFileSync(join(source,'scripts',script),git(['show',`${revision}:scripts/${script}`]))
  return source
}
const baseline=stage('observation-baseline-source',files.filter(file=>previous.has(file.version))),full=stage('observation-full-source',files)
const cleanEnv={...process.env}
for(const file of readdirSync('.').filter(name=>/^\.env(?:\.|$)/.test(name)))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);if(match)cleanEnv[match[1]]=''}
const env={...cleanEnv,MIGRATION_DB_HOST:'127.0.0.1',MIGRATION_DB_PORT:'55433',MIGRATION_DB_NAME:database,MIGRATION_DB_USER:decodeURIComponent(bootstrap.username),MIGRATION_DB_PASSWORD:decodeURIComponent(bootstrap.password),APP_DB_HOST:'127.0.0.1',APP_DB_PORT:'55433',APP_DB_NAME:database,APP_DB_USER:runtimeRole,APP_DB_PASSWORD:runtimePassword,DATABASE_URL:'',NODE_ENV:'production'}
const run=(source,name,expected=true)=>{
  const r=spawnSync(process.execPath,[join(source,'scripts/provision-runtime-db-role.mjs')],{cwd:source,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
  writeFileSync(join(directory,`observation-${name}.log`),(r.stdout??'')+(r.stderr??''))
  if(expected)assert.equal(r.status,0,`Synthetic ${name} failed; inspect its log.`)
  else assert.notEqual(r.status,0,'Incompatible types must be rejected.')
  return r
}
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
let target,created=false,roleOwned=false
await admin.connect();save()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[runtimeRole])).rowCount,0)
  for(const variant of ['legacy','canonical','hybrid','incompatible']){
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Never overwrite an existing target.')
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);created=true
    await admin.query(`COMMENT ON DATABASE ${database} IS '${marker}'`)
    target=new pg.Client({connectionString:targetUrl.toString(),connectionTimeoutMillis:5000});await target.connect()
    if(variant!=='canonical'){
      const schema=JSON.parse(git(['show',`${revision}:tests/fixtures/observation-batches-legacy-schema.json`]))
      const columns=schema.columns.map(c=>`"${c.column_name}" ${c.udt_name==='varchar'?`varchar(${c.character_maximum_length})`:c.udt_name}${c.is_nullable==='NO'?' NOT NULL':''}${c.column_default?' DEFAULT '+c.column_default:''}${c.column_name==='id'?' PRIMARY KEY':''}`)
      await target.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      await target.query(`CREATE TABLE observation_batches (${columns.join(',')})`)
      if(variant==='hybrid')await target.query('ALTER TABLE observation_batches ADD COLUMN source_file_name TEXT')
      if(variant==='incompatible')await target.query('ALTER TABLE observation_batches ADD COLUMN quality_metadata TEXT')
    }
    // The ordinary deployment provisioner runs the original migration registry,
    // applies restricted-role grants and verifies the runtime login itself.
    roleOwned=true;run(baseline,variant+'-baseline')
    const before=(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
    assert.ok(computeDrift(files.filter(f=>previous.has(f.version)),before).ok)
    const owner=randomUUID(),other=randomUUID(),project=randomUUID(),legacy=randomUUID(),noopSession=randomUUID(),noopCapture=randomUUID()
    for(const id of [owner,other])await target.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC observation schema regression')",[id,`${id}@example.invalid`])
    await target.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC observation upgrade - NOT FIELD EVIDENCE','engineering')",[project,owner])
    await target.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32737','SYNTHETIC UTM','WGS84','metres',37,'S','SYNTHETIC BM','local','grid',3,$2)",[project,owner])
    const metaColumns=variant==='canonical'?'source_file_name,operator,instrument_name':'source_file,operator_name,instrument'
    const canonicalColumns=variant==='canonical'?',quality_metadata,point_count,observation_count':''
    const canonicalValues=variant==='canonical'?',NULL,0,0':''
    await target.query(`INSERT INTO observation_batches(id,project_id,batch_number,source_type,source_file_hash,${metaColumns},status,created_by,created_at,updated_at${canonicalColumns}) VALUES($1,$2,'SYNTHETIC historical batch','manual',$3,'café original.csv','SYNTHETIC historical operator','SYNTHETIC historical instrument',$4,$5,'2020-01-02T03:04:05Z','2020-01-02T03:04:05Z'${canonicalValues})`,[legacy,project,'a'.repeat(64),variant==='canonical'?'raw':'RECORDED',owner])
    await target.query('CREATE TRIGGER qa_preserve_old_timestamp BEFORE UPDATE ON observation_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')
    const old=(await target.query('SELECT to_jsonb(t) value FROM observation_batches t WHERE id=$1',[legacy])).rows[0].value
    if(variant==='incompatible'){
      assert.throws(()=>assertImportSchemaContract({columns:[{table_name:'observation_batches',column_name:'quality_metadata',udt_name:'text'}],privileges:[],geometry:'geometry(Point,4326)'},{allowPendingObservationExtension:true}))
      const rejected=run(full,variant+'-forward',false)
      assert.match(rejected.stdout+rejected.stderr,/Unexpected observation_batches column type/)
      assert.deepEqual((await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,before)
      assert.deepEqual((await target.query('SELECT to_jsonb(t) value FROM observation_batches t WHERE id=$1',[legacy])).rows[0].value,old)
      report.incompatibleRejected=true;check('incompatible partial schema rejects the migration atomically with original ledger and values intact')
    }else{
      assertImportSchemaContract(await readImportSchemaContract(target,runtimeRole),{allowPendingObservationExtension:true})
      run(full,variant+'-forward')
      assertImportSchemaContract(await readImportSchemaContract(target,runtimeRole))
      const after=(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
      assert.ok(computeDrift(files,after).ok);assert.deepEqual(after.filter(row=>previous.has(row.version)),before)
      const upgraded=(await target.query('SELECT to_jsonb(t) value FROM observation_batches t WHERE id=$1',[legacy])).rows[0].value
      for(const [key,value]of Object.entries(old))assert.deepEqual(upgraded[key],value,`${variant} original ${key} changed`)
      if(variant!=='canonical'){assert.equal(upgraded.point_count,null);assert.equal(upgraded.observation_count,null);assert.equal(upgraded.source_file_name,null)}
      await target.query(`CREATE FUNCTION qa_noop_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${noopSession}'::uuid THEN RETURN NULL; END IF; RETURN NEW; END $$`)
      await target.query('CREATE TRIGGER qa_noop_session BEFORE INSERT ON import_sessions FOR EACH ROW EXECUTE FUNCTION qa_noop_session()')
      await target.query(`CREATE FUNCTION qa_noop_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${noopCapture}'::uuid THEN RETURN NULL; END IF; RETURN NEW; END $$`)
      await target.query('CREATE TRIGGER qa_noop_capture BEFORE INSERT ON observation_batches FOR EACH ROW EXECUTE FUNCTION qa_noop_capture()')
      const native=spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath','tests/observation-upgrade.native.test.ts'],{cwd:process.cwd(),env:{...cleanEnv,NODE_ENV:'test',DATABASE_URL:runtimeUrl.toString(),AUTH_SECRET:'synthetic-observation-upgrade-only',METARDU_OBSERVATION_UPGRADE:'synthetic-only',QA_OWNER:owner,QA_OTHER:other,QA_PROJECT:project,QA_LEGACY:legacy,QA_NOOP_SESSION:noopSession,QA_NOOP_CAPTURE:noopCapture},encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
      writeFileSync(join(directory,`observation-${variant}-native.log`),(native.stdout??'')+(native.stderr??''));assert.equal(native.status,0,`Native ${variant} service failed; inspect its log.`)
      const final=(await target.query('SELECT to_jsonb(t) value FROM observation_batches t WHERE id=$1',[legacy])).rows[0].value
      for(const [key,value]of Object.entries(old))assert.deepEqual(final[key],value)
      check(`${variant}: original values/status/timestamps and 117 hashes preserved through normal 118-entry upgrade`)
      check(`${variant}: restricted native service verifies NULL/zero heights, source bytes, replay, ownership, legacy history and silent-write rollback`)
    }
    report.variants.push(variant);save()
    await target.end();target=null
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[database])).rows[0].marker,marker)
    await admin.query(`DROP DATABASE ${database}`);created=false
  }
  Object.assign(report,{originalValuesPreserved:true,historicalHashesPreserved:true,normalRuntimeProvisioning:true,nativeServiceVerified:true,status:'passed'})
}catch(error){report.status='failed';report.failure=error.message;throw error}
finally{
  if(target)await target.end()
  if(created){assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[database])).rows[0]?.marker,marker);await admin.query(`DROP DATABASE ${database}`)}
  report.cleanup.syntheticDatabaseRemoved=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===0
  if(roleOwned){await admin.query(`DROP ROLE "${runtimeRole}"`);report.cleanup.syntheticRoleRemoved=true}
  await admin.end();save()
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,variants:report.variants,cleanup:report.cleanup}))
