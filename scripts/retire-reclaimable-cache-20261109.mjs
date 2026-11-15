// Exact-ID retirement of reclaimable, non-shared buildx cache records.
// Excludes the protected keepExactCacheIds from the prior retention report.
// No blanket prune: every removed ID is inspected first (reclaimable, not shared, plain ID).
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const file='test-results/production-upgrade/cache-retention-20261109.json'
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:120_000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr.trim());return r.stdout.trim()}
const parse=s=>s?s.split('\n').filter(Boolean).map(JSON.parse):[]
const cache=()=>parse(docker(['buildx','du','--builder','desktop-linux','--format','{{json .}}']))
const size=s=>{const m=/^([\d.]+)(B|kB|MB|GB|KiB|MiB|GiB)$/.exec(s);assert.ok(m);return Number(m[1])*({B:1,kB:1e3,MB:1e6,GB:1e9,KiB:1024,MiB:1024**2,GiB:1024**3}[m[2]])}
const report={startedAt:new Date().toISOString()}
try{
  const prior=JSON.parse(readFileSync('test-results/production-upgrade/cache-retention.json','utf8'))
  const keep=new Set(prior.keepExactCacheIds)
  const before=cache()
  report.before={records:before.length,approximateCacheBytes:before.reduce((n,r)=>n+size(r.Size),0)}
  // Targets: reclaimable, not shared, not protected, plain cache IDs.
  const targets=before.filter(r=>r.Reclaimable&&!r.Shared&&!keep.has(r.ID)&&/^[a-z0-9]{20,32}$/.test(r.ID))
  assert.ok(targets.length>0,'no eligible targets')
  const selector=`id~=^(${targets.map(r=>r.ID).join('|')})$`
  const matched=parse(docker(['buildx','du','--builder','desktop-linux','--filter',selector,'--format','{{json .}}']))
  assert.deepEqual(matched.map(r=>r.ID).sort(),targets.map(r=>r.ID).sort(),'selector matched unexpected records')
  assert.ok(matched.every(r=>r.Reclaimable&&!r.Shared))
  report.removedExactCacheIds=targets.map(r=>r.ID)
  report.removedApproximateBytes=targets.reduce((n,r)=>n+size(r.Size),0)
  const op=spawnSync('docker',['buildx','prune','--builder','desktop-linux','--force','--all','--filter',selector],{encoding:'utf8',windowsHide:true,timeout:300_000,maxBuffer:64*1024*1024})
  report.pruneExit=op.status;report.pruneOutput=op.stdout.trim();report.pruneDiagnostics=op.stderr.trim()
  assert.equal(op.status,0,op.stderr.trim())
  const after=cache()
  report.after={records:after.length,approximateCacheBytes:after.reduce((n,r)=>n+size(r.Size),0)}
  assert.ok(after.every(r=>!targets.some(t=>t.ID===r.ID)),'targeted records still present')
  // Protected records must survive.
  for(const id of keep)assert.ok(before.some(r=>r.ID===id)?after.some(r=>r.ID===id):true,`protected ${id} lost`)
  report.protectedRecordsPreserved=true
  report.status='passed'
  console.log(`PASS retired ${targets.length} records, ~${(report.removedApproximateBytes/1e9).toFixed(2)} GB; retained ~${(report.after.approximateCacheBytes/1e9).toFixed(2)} GB; protected records intact.`)
}catch(e){report.status='failed';report.failure={name:e.name,message:e.message};console.error(e.message);process.exitCode=1}finally{writeFileSync(file,JSON.stringify(report,null,2)+'\n')}
