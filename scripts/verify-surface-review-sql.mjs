import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
const root=process.cwd(),require=createRequire(path.join(root,'package.json'))
const {Client}=require('pg')
const {rehearsalDatabaseConfig}=await import(pathToFileURL(path.join(root,'scripts/rehearsal-database.mjs')))
const {grantRuntimePrivileges,quoteIdentifier}=await import(pathToFileURL(path.join(root,'scripts/provision-runtime-db-role.mjs')))
const {migrationChecksums}=await import(pathToFileURL(path.join(root,'scripts/verify-migrations.mjs')))
const owned=JSON.parse(execFileSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true}))[0]
assert.equal(owned.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.deepEqual(owned.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const baseConfig=rehearsalDatabaseConfig(),adminAddress=new URL(baseConfig.adminUrl),runtimeAddress=new URL(baseConfig.runtimeUrl)
adminAddress.pathname='/metardu_runtime_verify';runtimeAddress.pathname=adminAddress.pathname
process.env.TEST_ADMIN_DATABASE_URL=adminAddress.href;process.env.TEST_RUNTIME_DATABASE_URL=runtimeAddress.href
const config=rehearsalDatabaseConfig(),database=new Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
const migrationBytes=readFileSync(path.join(root,'src/lib/db/migrations/125_surface_source_reviews.sql'))
const sql=migrationBytes.toString('utf8').split(/^--\s*DOWN:/m)[0]
const ledgerHash=rows=>createHash('sha256').update(rows.map(row=>JSON.stringify(row)).sort().join('\n')).digest('hex')
const report={synthetic:true,database:config.database,migrationSha256:createHash('sha256').update(sql).digest('hex'),productionChanged:false,migrationLedgerChanged:false,transactionRolledBack:false,checks:[]}
let began=false
try{
 await database.connect()
 assert.equal((await database.query('SELECT current_database() AS db')).rows[0].db,config.database)
 assert.equal((await database.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
 const existed=(await database.query("SELECT to_regclass('public.surface_source_reviews') AS relation")).rows[0].relation!==null
 const ledger=(await database.query('SELECT * FROM public.schema_migrations')).rows,before=ledgerHash(ledger)
 if(existed){
   const applied=ledger.find(row=>row.version==='125_surface_source_reviews'),expected=migrationChecksums(migrationBytes)
   assert.ok(applied&&[expected.checksum,...expected.equivalentChecksums].includes(applied.checksum),'Existing review schema has no exact verified migration receipt; stop for inspection.')
 }
 await database.query('BEGIN');began=true
 await database.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='3s'")
 if(!existed)await database.query(sql)
 report.checks.push(existed?'existing review schema matches migration receipt':'up SQL parsed and dependencies resolved')
 const relation=(await database.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.surface_source_reviews'::regclass")).rows[0]
 assert.equal(relation.relrowsecurity,true);report.checks.push('review table RLS enabled')
 const rights=(await database.query(`SELECT has_table_privilege($1,'public.surface_source_reviews','SELECT') AS read,
  has_table_privilege($1,'public.surface_source_reviews','INSERT') AS create,
  has_table_privilege($1,'public.surface_source_reviews','UPDATE') AS update,
  has_table_privilege($1,'public.surface_source_reviews','DELETE') AS delete`,[config.runtimeRole])).rows[0]
 assert.deepEqual(rights,{read:true,create:true,update:false,delete:false});report.checks.push('restricted runtime has select/insert only')
 const migrationRole=(await database.query('SELECT current_user AS role')).rows[0].role
 await grantRuntimePrivileges(database,migrationRole,config.runtimeRole,config.database)
 const afterGrant=(await database.query(`SELECT has_table_privilege($1,'public.surface_source_reviews','UPDATE') AS update,
  has_table_privilege($1,'public.surface_source_reviews','DELETE') AS delete`,[config.runtimeRole])).rows[0]
 assert.deepEqual(afterGrant,{update:false,delete:false});report.checks.push('runtime provisioning preserves insert-only review privileges')
 const policies=(await database.query("SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='surface_source_reviews' ORDER BY cmd")).rows.map(row=>row.cmd)
 assert.deepEqual(policies,['INSERT','SELECT']);report.checks.push('only explicit read/insert policies exist')
 const ids={owner:randomUUID(),crew:randomUUID(),viewer:randomUUID(),other:randomUUID(),project:randomUUID(),foreign:randomUUID(),surface:randomUUID(),foreignSurface:randomUUID(),revision:randomUUID(),foreignRevision:randomUUID()}
 const sourceHash='a'.repeat(64),referenceHash='c'.repeat(64)
 const outputEvidence=JSON.stringify({algorithm:'sha256-canonical-json-v1',contoursHash:'b'.repeat(64),meshHash:'b'.repeat(64)})
 const outputHash=createHash('sha256').update(outputEvidence).digest('hex')
 const rawHashSql="SELECT encode(public.digest(COALESCE(string_agg(row_to_json(o)::text,E'\\n' ORDER BY o.id),''),'sha256'),'hex') AS hash FROM public.survey_observations o"
 const rawBefore=(await database.query(rawHashSql)).rows[0].hash
 for(const id of [ids.owner,ids.crew,ids.viewer,ids.other]){
   await database.query("INSERT INTO public.users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','SYNTHETIC review SQL operator')",[id,`review-${id}@example.invalid`])
   await database.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id])
 }
 for(const [projectId,ownerId,surfaceId,revisionId] of [[ids.project,ids.owner,ids.surface,ids.revision],[ids.foreign,ids.other,ids.foreignSurface,ids.foreignRevision]]){
   await database.query("INSERT INTO public.projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC review SQL only')",[projectId,ownerId])
   await database.query("INSERT INTO public.surfaces(id,project_id,name) VALUES($1,$2,'SYNTHETIC SQL permission fixture')",[surfaceId,projectId])
   await database.query(`INSERT INTO public.surface_revisions(id,surface_id,revision,algorithm,input_hash,result)
     VALUES($1,$2,1,'synthetic-permission-fixture',$3,$4)`,[revisionId,surfaceId,sourceHash,JSON.stringify({snapshot:{referenceHash},outputIntegrity:JSON.parse(outputEvidence)})])
   await database.query('UPDATE public.surfaces SET current_revision_id=$1 WHERE id=$2',[revisionId,surfaceId])
 }
 await database.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'surveyor'),($1,$3,'viewer')",[ids.project,ids.crew,ids.viewer])
 const actor=async id=>{await database.query(`SET LOCAL ROLE ${quoteIdentifier(config.runtimeRole)}`);await database.query("SELECT set_config('request.user_id',$1,true)",[id])}
 const insert=async(changes={})=>{
   const row={id:randomUUID(),projectId:ids.project,revisionId:ids.revision,sourceHash,referenceHash,outputHash,outputEvidence,actorId:ids.crew,requestId:randomUUID(),...changes}
   return database.query(`INSERT INTO public.surface_source_reviews(id,project_id,source_revision_id,source_hash,source_reference_hash,
     source_output_hash,source_output_evidence,actor_id,request_id,command_hash,outcome,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reviewed_for_draft','SYNTHETIC SQL role check') RETURNING id`,
     [row.id,row.projectId,row.revisionId,row.sourceHash,row.referenceHash,row.outputHash,row.outputEvidence,row.actorId,row.requestId,'d'.repeat(64)])
 }
 const denied=async(name,work,codes=['42501'])=>{
   await database.query('SAVEPOINT rejected_review')
   let rejection
   try{await work()}catch(error){rejection=error}
   await database.query('ROLLBACK TO SAVEPOINT rejected_review');await database.query('RELEASE SAVEPOINT rejected_review')
   assert.ok(rejection&&codes.includes(rejection.code),`${name}: expected rejection ${codes.join('/')}, received ${rejection?.code??'success'}`)
   report.checks.push(name)
 }
 await actor(ids.crew)
 const saved=(await insert()).rows[0].id
 report.checks.push('recognized crew can insert an attributed source review')
 await denied('spoofed review actor rejected',()=>insert({actorId:ids.owner}))
 await denied('cross-project revision rejected',()=>insert({revisionId:ids.foreignRevision}))
 await denied('mismatched input hash rejected',()=>insert({sourceHash:'e'.repeat(64)}))
 await denied('mismatched reference hash rejected',()=>insert({referenceHash:'e'.repeat(64)}))
 const altered=JSON.stringify({algorithm:'sha256-canonical-json-v1',contoursHash:'e'.repeat(64),meshHash:'b'.repeat(64)})
 await denied('mismatched retained output evidence rejected',()=>insert({outputEvidence:altered,outputHash:createHash('sha256').update(altered).digest('hex')}))
 await denied('mismatched output evidence digest rejected',()=>insert({outputHash:'e'.repeat(64)}),['23514'])
 await denied('runtime cannot update a retained review',()=>database.query('UPDATE public.surface_source_reviews SET note=$1 WHERE id=$2',['changed',saved]))
 await denied('runtime cannot delete a retained review',()=>database.query('DELETE FROM public.surface_source_reviews WHERE id=$1',[saved]))
 await actor(ids.viewer)
 assert.equal((await database.query('SELECT id FROM public.surface_source_reviews WHERE project_id=$1',[ids.project])).rows.length,1)
 await denied('viewer review insertion rejected',()=>insert({actorId:ids.viewer}))
 report.checks.push('viewer can read the authorized review history')
 await actor(ids.other)
 assert.equal((await database.query('SELECT id FROM public.surface_source_reviews WHERE project_id=$1',[ids.project])).rows.length,0)
 await denied('unrelated review insertion rejected',()=>insert({actorId:ids.other}))
 report.checks.push('unrelated user cannot read another project review')
 await database.query('RESET ROLE')
 await denied('immutable trigger also rejects owner-level mutation',()=>database.query('UPDATE public.surface_source_reviews SET note=$1 WHERE id=$2',['changed',saved]))
 assert.equal((await database.query(rawHashSql)).rows[0].hash,rawBefore)
 report.checks.push('existing raw-observation fingerprint unchanged')
 await database.query('ROLLBACK');began=false;report.transactionRolledBack=true
 assert.equal((await database.query("SELECT to_regclass('public.surface_source_reviews') AS relation")).rows[0].relation!==null,existed)
 assert.equal(ledgerHash((await database.query('SELECT * FROM public.schema_migrations')).rows),before)
 report.checks.push('rollback restored initial schema presence and preserved migration ledger')
 report.passed=true
}catch(error){report.passed=false;report.error=error instanceof Error?error.message:'SQL check failed';process.exitCode=1}
finally{if(began){await database.query('ROLLBACK');report.transactionRolledBack=true}await database.end()}
mkdirSync(path.join(root,'.cache/collaboration-source'),{recursive:true})
writeFileSync(path.join(root,'.cache/collaboration-source/review-sql-rollback.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
