// Resume only the saved exact-ID plan after its two error records were retired.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const file='test-results/production-upgrade/cache-retention.json'
const report=JSON.parse(readFileSync(file,'utf8'))
assert.deepEqual(report.removedFailedBuildRecords,['rd202rieg5o6zp6h0xtgm6o3c','lx0zy3l3ifbvfetbo6ep4lq9i'])
assert.ok(Array.isArray(report.prunedExactCacheIds)&&report.prunedExactCacheIds.length>0)
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60_000,maxBuffer:10*1024*1024});assert.equal(r.status,0,r.stderr.trim());return r.stdout.trim()}
const parse=s=>s?s.split('\n').filter(Boolean).map(JSON.parse):[]
const cache=()=>parse(docker(['buildx','du','--builder','desktop-linux','--format','{{json .}}']))
const imageIds=()=>[...new Set(docker(['image','ls','-q','--no-trunc']).split(/\s+/).filter(Boolean))].sort()
const mounts=c=>c.Mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
const containers=()=>JSON.parse(docker(['inspect',...docker(['ps','-aq']).split(/\s+/).filter(Boolean)])).map(c=>({name:c.Name,id:c.Id,image:c.Image,status:c.State.Status,started:c.State.StartedAt,mounts:mounts(c)})).sort((a,b)=>a.id.localeCompare(b.id))
const size=s=>{const m=/^([\d.]+)(B|kB|MB|GB|KiB|MiB|GiB)$/.exec(s);assert.ok(m);return Number(m[1])*({B:1,kB:1e3,MB:1e6,GB:1e9,KiB:1024,MiB:1024**2,GiB:1024**3}[m[2]])}
const save=()=>writeFileSync(file,JSON.stringify(report,null,2)+'\n')
try{
  const history=parse(docker(['buildx','history','ls','--builder','desktop-linux','--format','json']))
  assert.ok(history.every(row=>row.status!=='Running'&&row.status!=='Pending'))
  assert.ok(history.every(row=>!report.removedFailedBuildRecords.some(id=>row.ref.endsWith('/'+id))))
  assert.deepEqual(containers(),report.before.containers);assert.deepEqual(imageIds(),report.before.imageIds)
  const before=cache();assert.ok(report.keepExactCacheIds.every(id=>before.some(row=>row.ID===id)))
  const targets=before.filter(row=>report.prunedExactCacheIds.includes(row.ID)&&row.Reclaimable&&!row.Shared)
  assert.ok(targets.length>0);assert.ok(targets.every(row=>/^[a-z0-9]{20,32}$/.test(row.ID)))
  const selector=`id~=^(${targets.map(row=>row.ID).join('|')})$`
  const matched=parse(docker(['buildx','du','--builder','desktop-linux','--filter',selector,'--format','{{json .}}']))
  assert.deepEqual(matched.map(row=>row.ID).sort(),targets.map(row=>row.ID).sort())
  assert.ok(matched.every(row=>row.Reclaimable&&!row.Shared))
  const args=['buildx','prune','--builder','desktop-linux','--force','--filter',selector]
  const operation=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60_000,maxBuffer:10*1024*1024})
  report.resumedPrune={exactIds:targets.map(row=>row.ID),selectorMatchedExactlyThroughReadOnlyInventory:true,exit:operation.status,output:operation.stdout.trim(),diagnostics:operation.stderr.trim()}
  save();assert.equal(operation.status,0,operation.stderr.trim())
  const after=cache();report.after={records:after,approximateCacheBytes:after.reduce((n,r)=>n+size(r.Size),0)}
  report.prunedExactCacheIds=targets.map(row=>row.ID);assert.ok(after.every(row=>!report.prunedExactCacheIds.includes(row.ID)))
  assert.deepEqual(containers(),report.before.containers);assert.deepEqual(imageIds(),report.before.imageIds)
  assert.deepEqual(parse(docker(['buildx','history','ls','--builder','desktop-linux','--format','json'])).map(row=>row.ref).sort(),history.map(row=>row.ref).sort())
  for(const[tag,id]of Object.entries(report.protectedImageTags))assert.equal(docker(['image','inspect',`metardu-metardu-app:${tag}`,'--format','{{.Id}}']),id)
  report.approximateCacheBytesRemoved=report.before.approximateCacheBytes-report.after.approximateCacheBytes
  report.allContainersImagesMountsAndOtherBuildHistoryPreserved=true
  report.retentionTargetMet=report.after.approximateCacheBytes<=report.approximateRetentionTargetBytes
  report.remainingReportedInUse=after.filter(row=>!row.Reclaimable&&!report.keepExactCacheIds.includes(row.ID)).map(row=>({id:row.ID,description:row.Description,size:row.Size}))
  delete report.failure
  report.status=report.retentionTargetMet?'passed':'eligible-cache-retired-in-use-retained'
  console.log(`PASS exact cache retirement; ${(report.after.approximateCacheBytes/1e9).toFixed(2)} GB retained; all images, containers, mounts and unrelated history preserved.`)
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};console.error(error.message);process.exitCode=1}finally{save()}
