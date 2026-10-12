import assert from 'node:assert/strict'
import {readFileSync,readdirSync,mkdirSync,createWriteStream,writeFileSync} from 'node:fs'
import {spawn} from 'node:child_process'
import pg from 'pg'
const env={...process.env}
// Set only dotenv key names to blank: never load or log customer credentials.
for(const file of readdirSync('.').filter(name=>/^\.env(?:\.|$)/.test(name)))for(const line of readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);if(match)env[match[1]]=''}
Object.assign(env,{NODE_ENV:'production',ANALYZE:'true',ANALYZE_TARGET:'client',ANALYZE_REPORT_MODE:'json',METARDU_NEXT_DIST_DIR:process.env.METARDU_PERF_DIST_DIR||'.next-analyze-perf',DISABLE_PWA:'true',NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://release_beacon_app:local_release_beacon_only@127.0.0.1:55433/metardu_runtime_verify',AUTH_SECRET:'isolated-cad-io-preview-only',NEXTAUTH_SECRET:'isolated-cad-io-preview-only',NEXTAUTH_URL:'http://127.0.0.1:3021',METARDU_MCP_ENABLED:'false',METARDU_MCP_ORIGIN:'https://metardu.example'})
const client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:10000});await client.connect()
assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08');await client.end()
const root='test-results/performance-source-batch';mkdirSync(root,{recursive:true})
const log=createWriteStream('.cache/release-verify/performance-client-analyze.log')
const child=spawn(process.execPath,['scripts/analyze-build.mjs','--report'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false})
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});await new Promise(resolve=>log.end(resolve))
const result={recordedAt:new Date().toISOString(),status:exit===0?'built':'failed',exit,analyze:true,target:'client',reportMode:'json',distDir:env.METARDU_NEXT_DIST_DIR,database:'metardu_runtime_verify',previewBuildDirectoryTouched:false,customerConfigurationLoaded:false,productionMutated:false}
writeFileSync(`${root}/source-analyzer.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=exit??1
