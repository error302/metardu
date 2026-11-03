// Read-only GET and Windows power inspection. No service, credential, DNS or power mutation.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {writeFileSync,mkdirSync,realpathSync,existsSync} from 'node:fs'
import path from 'node:path'
import {availabilityVerdict} from './availability-contract.mjs'
const revision=process.argv[2];assert.match(revision??'',/^[a-f0-9]{40}$/,'Supply the deployed application SHA, not a documentation commit.')
assert.ok(process.argv.length<=4,'Only an optional evidence directory is supported.')
const directory=path.resolve(process.argv[3]??'.cache/public-availability'),root=realpathSync(process.cwd())
assert.ok(directory.startsWith(root+path.sep),'Evidence must stay inside this checkout.')
let ancestor=directory
while(!existsSync(ancestor))ancestor=path.dirname(ancestor)
const resolvedAncestor=realpathSync(ancestor)
assert.ok(resolvedAncestor===root||resolvedAncestor.startsWith(root+path.sep),'Evidence ancestor redirects outside this checkout.')
mkdirSync(directory,{recursive:true});assert.ok(realpathSync(directory).startsWith(root+path.sep),'Redirected evidence directory is outside this checkout.')
const report={revision,startedAt:new Date().toISOString(),scope:'Anonymous GETs and power inspection only',recordsChanged:false,timeoutMs:15000}
async function probe(base,p){
  const started=performance.now();let headersMs=null
  try{const response=await fetch(base+p,{redirect:'manual',signal:AbortSignal.timeout(report.timeoutMs),headers:{'Cache-Control':'no-cache'}})
    headersMs=Math.round(performance.now()-started)
    const result={path:p,status:response.status,location:response.headers.get('location'),headersMs}
    if(p==='/api/public/health'){try{const body=await response.json();result.healthStatus=body.status;result.releaseId=body.releaseId}catch{result.error='health-response-not-json'}}else await response.arrayBuffer()
    result.totalMs=Math.round(performance.now()-started)
    return result
  }catch(error){return {path:p,status:null,headersMs,totalMs:Math.round(performance.now()-started),error:error.name==='TimeoutError'?'timeout':error.cause?.code??'request-failed'}}
}
report.origin=await probe('http://127.0.0.1:3000','/api/public/health')
report.publicHealth=await probe('https://metardu.space','/api/public/health')
report.routes=[]
for(const p of ['/','/login','/dashboard','/equipment','/admin'])report.routes.push(await probe('https://metardu.space',p))
report.originRoutes=[]
for(const route of report.routes)if(['/','/login'].includes(route.path)&&route.status!==200)report.originRoutes.push(await probe('http://127.0.0.1:3000',route.path))
report.power={required:process.platform==='win32'}
if(report.power.required){
  const code="Add-Type -AssemblyName System.Windows.Forms; $s=[int][System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus; $q=powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE; $a=($q | Select-String 'Current AC Power Setting Index:').ToString().Split(':')[-1].Trim(); $d=($q | Select-String 'Current DC Power Setting Index:').ToString().Split(':')[-1].Trim(); [pscustomobject]@{lineStatus=$s;activeSleepSeconds=$(if($s -eq 1){[Convert]::ToInt32($a,16)}elseif($s -eq 0){[Convert]::ToInt32($d,16)}else{-1})} | ConvertTo-Json -Compress"
  const r=spawnSync(path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:15000})
  if(r.status===0){try{Object.assign(report.power,JSON.parse(r.stdout.trim().replace(/^\uFEFF/,'')))}catch{report.power.error='unreadable-power-observation'}}else report.power.error='power-observation-unavailable'
}
report.verdict=availabilityVerdict(report);report.finishedAt=new Date().toISOString()
const file=path.join(directory,'availability-'+report.finishedAt.replace(/[:.]/g,'-')+'.json');writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'})
console.log(JSON.stringify({revision,...report.verdict,power:report.power,receipt:file}));if(!report.verdict.passed)process.exitCode=1
