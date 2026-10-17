// Rehearse the pinned 112 -> 115 source upgrade in the existing test service.
// This creates only a marked temporary synthetic database, never a container,
// customer copy, production connection, image or replacement migration hash.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {computeDrift,migrationChecksums} from './verify-migrations.mjs'
import {pinnedReleaseArguments} from './release-plan.mjs'

const database='metardu_survey_upgrade_verify'
const marker='METARDU disposable source-only survey upgrade verification'
const fixtureId='ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
export function surveyUpgradeTarget(adminUrl) {
  const address=new URL(adminUrl)
  assert.ok(['postgres:','postgresql:'].includes(address.protocol))
  assert.equal(address.hostname,'127.0.0.1');assert.equal(address.port,'55433')
  assert.equal(address.pathname,'/metardu_runtime_verify')
  assert.equal(address.search,'');assert.equal(address.hash,'')
  address.pathname='/'+database
  return address.toString()
}

async function main() {
  const revision=process.argv[2];assert.match(revision??'',/^[a-f0-9]{40}$/)
  const config=rehearsalDatabaseConfig(),url=surveyUpgradeTarget(config.adminUrl)
  const {directory}=pinnedReleaseArguments(['rehearse',revision,...process.argv.slice(3)],process.cwd())
  const receipt=JSON.parse(readFileSync(join(directory,'promotion.json'),'utf8'))
  assert.equal(receipt.revision,revision);assert.equal(receipt.status,'planned')
  const report={revision,customerDataCopied:false,newContainer:false,sourceBaseline:receipt.migrationBefore.length,checks:[],cleanup:{},status:'checking'}
  const save=()=>writeFileSync(join(directory,'upgrade-checks.json'),JSON.stringify(report,null,2)+'\n')
  const check=name=>{report.checks.push({name,passed:true});save();console.log('PASS '+name)}
  const git=args=>{
    const result=spawnSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8',windowsHide:true})
    assert.equal(result.status,0,'Pinned source read failed');return result.stdout
  }
  const inspection=spawnSync('docker',['inspect',fixtureId],{encoding:'utf8',windowsHide:true})
  assert.equal(inspection.status,0);const fixture=JSON.parse(inspection.stdout)[0]
  assert.equal(fixture.Id,fixtureId);assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal')
  assert.equal(fixture.State.Running,true)
  assert.deepEqual(fixture.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
  const paths=git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).trim().split('\n').filter(p=>p.endsWith('.sql')).sort()
  const files=paths.map(path=>{const content=git(['show',`${revision}:${path}`]);return{path,version:path.split('/').at(-1).slice(0,-4),content,...migrationChecksums(Buffer.from(content))}})
  const previous=new Set(receipt.migrationBefore.map(row=>row.version))
  assert.equal(previous.size,receipt.migrationBefore.length);assert.equal(files.length,receipt.migrationBefore.length+receipt.pending.length)
  assert.deepEqual(files.filter(file=>!previous.has(file.version)).map(file=>file.version),receipt.pending)
  const stage=(name,selected)=>{
    const target=join(directory,name)
    for(const file of selected){const dest=join(target,file.path);mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,file.content)}
    mkdirSync(join(target,'scripts'),{recursive:true})
    for(const script of ['migrate-unified.mjs','verify-migrations.mjs'])writeFileSync(join(target,'scripts',script),git(['show',`${revision}:scripts/${script}`]))
    return target
  }
  const baseline=stage('upgrade-baseline-source',files.filter(file=>previous.has(file.version)))
  const full=stage('upgrade-full-source',files)
  const migrate=(source,name)=>{
    report.active={name,startedAt:new Date().toISOString()};save();console.log('START '+name)
    const result=spawnSync(process.execPath,[join(source,'scripts/migrate-unified.mjs')],{cwd:source,env:{...process.env,DATABASE_URL:url},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
    writeFileSync(join(directory,`upgrade-${name}.log`),(result.stdout??'')+(result.stderr??''))
    delete report.active
    if(result.status!==0){report.failedAt=(result.stdout??'').match(/Applying: ([^\r\n]+)/g)?.at(-1)??name;save()}
    assert.equal(result.status,0,`Synthetic ${name} failed; inspect its source-only log.`)
  }
  const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
  let target,created=false
  await admin.connect()
  try {
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'An existing target must be inspected, never overwritten.')
    const role=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[config.runtimeRole])).rows[0]
    assert.ok(role&&!role.rolsuper&&!role.rolbypassrls)
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);created=true
    await admin.query(`COMMENT ON DATABASE ${database} IS '${marker}'`)
    target=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});await target.connect()
    migrate(baseline,'baseline')
    const ledger=async()=>(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
    const before=await ledger();assert.ok(computeDrift(files.filter(f=>previous.has(f.version)),before).ok)
    check(`all ${previous.size} prior source migrations bootstrap normally`)
    const owner=randomUUID(),other=randomUUID(),project=randomUUID(),alignment=randomUUID()
    for(const id of [owner,other])await target.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC upgrade operator')",[id,`${id}@example.invalid`])
    await target.query("INSERT INTO surveyor_profiles(user_id,role,verified_isk,is_suspended) VALUES($1,'surveyor',false,false),($2,'surveyor',false,false)",[owner,other])
    await target.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC source upgrade - NOT FIELD EVIDENCE','engineering')",[project,owner])
    const template={carriagewayWidth:6,shoulderWidth:0,camber:0}
    await target.query("INSERT INTO road_alignments(id,project_id,road_name,cross_section_template) VALUES($1,$2,'SYNTHETIC legacy road',$3)",[alignment,project,JSON.stringify(template)])
    await target.query('INSERT INTO alignment_ips(alignment_id,ip_number,easting,northing,radius) VALUES($1,1,0,0,0)',[alignment])
    await target.query('INSERT INTO alignment_vertical_ips(alignment_id,chainage,elevation,curve_length) VALUES($1,0,0,40)',[alignment])
    await target.query("INSERT INTO cross_section_stations(alignment_id,chainage,existing_ground,proposed_road) VALUES($1,0,'{\"profile\":[{\"offset\":0,\"level\":0}]}','{\"designLevel\":-1}')",[alignment])
    const tables=['users','surveyor_profiles','projects','road_alignments','alignment_ips','alignment_vertical_ips','cross_section_stations']
    const snapshot=async()=>{
      const result={}
      for(const table of tables)result[table]=(await target.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)).rows.map(r=>r.value)
      return result
    }
    const records=await snapshot()
    migrate(full,'forward')
    const after=await ledger();assert.ok(computeDrift(files,after).ok)
    assert.deepEqual(after.filter(row=>previous.has(row.version)),before)
    check('pending migrations apply through the normal runner with historical hashes unchanged')
    const upgraded=await snapshot()
    for(const table of tables){
      assert.equal(upgraded[table].length,records[table].length)
      for(let i=0;i<records[table].length;i++)for(const [key,value]of Object.entries(records[table][i]))assert.deepEqual(upgraded[table][i][key],table==='road_alignments'&&key==='cross_section_template'&&typeof value==='string'?JSON.parse(value):value)
    }
    check('all original synthetic records and zero/negative measurements survive; template converts without loss')
    assert.equal((await target.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='road_alignments' AND column_name='cross_section_template'")).rows[0].data_type,'jsonb')
    await target.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${config.runtimeRole}"`)
    await target.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON schema_migrations FROM "${config.runtimeRole}"`)
    await target.query('BEGIN')
    await target.query(`SET LOCAL ROLE "${config.runtimeRole}"`)
    await target.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true),set_config('request.access_role','',true)",[owner])
    await target.query('SAVEPOINT guard')
    let refused=false
    try{await target.query("UPDATE surveyor_profiles SET role='admin' WHERE user_id=$1",[owner])}catch(error){refused=error.code==='42501'}
    await target.query('ROLLBACK TO SAVEPOINT guard');assert.ok(refused)
    assert.equal((await target.query("UPDATE surveyor_profiles SET firm_name='SYNTHETIC usable edit' WHERE user_id=$1",[owner])).rowCount,1)
    check('new profile authority guard blocks self-promotion and permits ordinary profile edits')
    const capture={schemaVersion:1,scope:'numerical_profile_only',rawCsv:'point_id,chainage_m,invert_rl_m\nSYN-P1,0,10',metadata:{},criterion:null,result:{points:[{id:'SYN-P1'}],algorithmVersion:'2.0.0'}}
    const batch=randomUUID()
    await target.query("INSERT INTO pipeline_asbuilt_batches(id,project_id,actor_id,client_batch_id,input_hash,capture,project_name) VALUES($1,$2,$3,$4,$5,$6,'SYNTHETIC')",[batch,project,owner,randomUUID(),'a'.repeat(64),JSON.stringify(capture)])
    await target.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true)",[other])
    assert.equal((await target.query('SELECT id FROM pipeline_asbuilt_batches WHERE id=$1',[batch])).rowCount,0)
    await target.query('ROLLBACK')
    check('new pipeline history accepts the owner and remains private to other users')
    report.status='passed';save()
  } catch(error) {report.status='failed';report.failure=error.message;save();throw error}
  finally {
    if(target){await target.query('ROLLBACK').catch(()=>{});await target.end()}
    try {
      if(created){
        assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",[database])).rows[0]?.marker,marker)
        await admin.query("SET statement_timeout='5s'")
        await admin.query(`DROP DATABASE ${database}`)
        report.cleanup.syntheticDatabaseRemoved=true
      }
    } finally {await admin.end();save()}
  }
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,cleanup:report.cleanup,newContainer:false,customerDataCopied:false}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1})
