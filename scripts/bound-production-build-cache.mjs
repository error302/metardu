// Exact-ID retention for this planned METARDU build window. Not a generic prune.
// Keep the current installed-dependency ancestry plus APK/NPM download caches.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const file='test-results/production-upgrade/cache-retention.json'
const build=JSON.parse(readFileSync('test-results/production-upgrade/candidate-build.json','utf8'))
const knownBuilds=new Set(['4yq1bmbzk73ga12d6n0mxofef','k5bsy5uotzf0v6xp8lvreks9b','rd202rieg5o6zp6h0xtgm6o3c','lx0zy3l3ifbvfetbo6ep4lq9i'])
const failed=['rd202rieg5o6zp6h0xtgm6o3c','lx0zy3l3ifbvfetbo6ep4lq9i']
const start=Date.parse('2026-10-09T23:02:12Z'),end=Date.parse('2026-10-10T00:35:30Z')
const report={scope:'Only exact inspected private cache IDs from four METARDU builds',status:'preparing',windowsDiskCompacted:false}
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60_000,maxBuffer:10*1024*1024});assert.equal(r.status,0,`Docker ${args[0]} failed; inspect phase evidence`);return r.stdout.trim()}
const lines=value=>value?value.split('\n').filter(Boolean).map(JSON.parse):[]
const history=()=>lines(docker(['buildx','history','ls','--builder','desktop-linux','--format','json']))
const cache=()=>lines(docker(['buildx','du','--builder','desktop-linux','--format','{{json .}}']))
const owned=row=>{const created=Date.parse(row.CreatedAt.slice(0,19).replace(' ','T')+'Z');return created>=start&&created<=end&&!row.Shared}
const size=value=>{const match=/^([\d.]+)(B|kB|MB|GB|KiB|MiB|GiB)$/.exec(value);assert.ok(match,'Unsupported cache size');return Number(match[1])*({B:1,kB:1e3,MB:1e6,GB:1e9,KiB:1024,MiB:1024**2,GiB:1024**3}[match[2]])}
const total=rows=>rows.reduce((n,row)=>n+size(row.Size),0)
const mounts=c=>c.Mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
const inventory=()=>{const ids=docker(['ps','-aq']).split(/\s+/).filter(Boolean);return JSON.parse(docker(['inspect',...ids])).map(c=>({name:c.Name,id:c.Id,image:c.Image,status:c.State.Status,started:c.State.StartedAt,mounts:mounts(c)})).sort((a,b)=>a.id.localeCompare(b.id))}
const imageIds=()=>[...new Set(docker(['image','ls','-q','--no-trunc']).split(/\s+/).filter(Boolean))].sort()
function idle(rows){assert.ok(rows.every(row=>row.status!=='Running'&&row.status!=='Pending'));for(const row of rows.filter(r=>Date.parse(r.created_at)>=start)){assert.ok(knownBuilds.has(row.ref.split('/').at(-1)));assert.equal(row.name,'METARDU');assert.ok(row.completed_at)}}
function save(){writeFileSync(file,JSON.stringify(report,null,2)+'\n')}
try{
  assert.equal(build.status,'built')
  const beforeHistory=history();idle(beforeHistory)
  assert.match(docker(['buildx','inspect','desktop-linux']),/Driver:\s+docker\b/)
  const beforeContainers=inventory(),beforeImages=imageIds()
  assert.equal(beforeContainers.find(c=>c.name==='/metardu-app').image,build.imageId)
  report.protectedImageTags={}
  for(const tag of ['candidate','latest','rollback-current','rollback-20261010'])report.protectedImageTags[tag]=docker(['image','inspect',`metardu-metardu-app:${tag}`,'--format','{{.Id}}'])
  assert.equal(report.protectedImageTags.candidate,build.imageId);assert.equal(report.protectedImageTags.latest,build.imageId)
  const beforeCache=cache(),byId=new Map(beforeCache.map(row=>[row.ID,row])),keep=new Set()
  function keepAncestry(id){assert.ok(byId.has(id),'Protected dependency cache changed');if(keep.has(id))return;keep.add(id);for(const parent of byId.get(id).Parents??[])keepAncestry(parent)}
  for(const id of ['xlqgtydgfabvugyte3ughy7pf','aafb62e4l4ptw4k10pe6nmsp3','twjm0g6a2sspqy0h2ljhyjqsf'])keepAncestry(id)
  const allowed=beforeCache.filter(row=>owned(row)&&!keep.has(row.ID)).map(row=>row.ID)
  report.before={approximateCacheBytes:total(beforeCache),records:beforeCache,ownedBuilds:beforeHistory.filter(row=>knownBuilds.has(row.ref.split('/').at(-1))),containers:beforeContainers,imageIds:beforeImages}
  report.keepExactCacheIds=[...keep];report.allowedExactCacheIds=allowed
  report.approximateRetentionTargetBytes=4e9;report.status='prepared';save()
  if(!process.argv.includes('--execute')){console.log(`Prepared ${allowed.length} owned cache IDs; keep current dependency ancestry and download caches. No deletion performed.`);process.exit(0)}
  for(const id of failed){const row=beforeHistory.find(r=>r.ref.endsWith('/'+id));assert.equal(row?.name,'METARDU');assert.equal(row?.status,'Error');docker(['buildx','history','rm','--builder','desktop-linux',id])}
  report.removedFailedBuildRecords=failed;save()
  idle(history())
  const inspected=cache(),targets=inspected.filter(row=>allowed.includes(row.ID)&&owned(row)&&row.Reclaimable&&!row.Shared)
  assert.ok(targets.every(row=>/^[a-z0-9]{20,32}$/.test(row.ID)))
  report.prunedExactCacheIds=targets.map(row=>row.ID);save()
  if(targets.length){
    const selector=`id~=^(${targets.map(row=>row.ID).join('|')})$`
    const matched=lines(docker(['buildx','du','--builder','desktop-linux','--filter',selector,'--format','{{json .}}']))
    assert.deepEqual(matched.map(row=>row.ID).sort(),targets.map(row=>row.ID).sort())
    assert.ok(matched.every(row=>row.Reclaimable&&!row.Shared))
    docker(['buildx','prune','--builder','desktop-linux','--force','--filter',selector])
  }
  const after=cache();report.after={approximateCacheBytes:total(after),records:after}
  assert.ok(after.every(row=>!report.prunedExactCacheIds.includes(row.ID)))
  assert.deepEqual(inventory(),beforeContainers);assert.deepEqual(imageIds(),beforeImages)
  for(const [tag,id]of Object.entries(report.protectedImageTags))assert.equal(docker(['image','inspect',`metardu-metardu-app:${tag}`,'--format','{{.Id}}']),id)
  const retainedHistory=history();assert.deepEqual(retainedHistory.map(row=>row.ref).sort(),beforeHistory.filter(row=>!failed.some(id=>row.ref.endsWith('/'+id))).map(row=>row.ref).sort())
  report.approximateCacheBytesRemoved=report.before.approximateCacheBytes-report.after.approximateCacheBytes
  report.allContainersImagesMountsAndOtherBuildHistoryPreserved=true
  assert.ok(report.after.approximateCacheBytes<=report.approximateRetentionTargetBytes,'Owned cache remains over retention target; inspect without broadening cleanup.')
  report.status='passed';console.log(`PASS exact owned cache retirement; ${(report.after.approximateCacheBytes/1e9).toFixed(2)} GB retained, all containers/images/mounts and other history preserved.`)
}catch(error){report.status='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;console.error(error.message)}finally{save()}
