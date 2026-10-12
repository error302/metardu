// Publish only the reviewed in-platform notice; never accepts a historical timestamp.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
const content=JSON.parse(readFileSync('src/lib/chatgpt/noticeContent.json','utf8'))
const digest=createHash('sha256').update(`${content.version}\n${content.title}\n${content.paragraphs.join('\n\n')}`).digest('hex')
assert.match(content.version,/^[a-z0-9-]+$/)
assert.ok(process.argv.slice(2).every(arg=>arg==='--execute'),'Only --execute is accepted; publication cannot be backdated')
const base='http://127.0.0.1:3000',root='test-results/chatgpt-notice-publication'
function docker(args,input){const result=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});assert.equal(result.status,0,'Publication runtime operation failed; diagnostics suppressed');return result.stdout.trim()}
const app=JSON.parse(docker(['inspect','metardu-app']))[0]
const promotion=JSON.parse(readFileSync('test-results/notice-worker-release/promotion.json','utf8'))
assert.equal(promotion.status,'promoted');assert.equal(app.Image,promotion.applicationAfter.image)
assert.equal(app.State.Health.Status,'healthy')
assert.ok(app.Mounts.some(m=>m.Type==='volume'&&m.Destination==='/app/upload'&&m.RW===true))
assert.ok(app.Config.Env.includes('METARDU_MCP_ENABLED=false'),'Publication must not enable customer linking')
const healthResponse=await fetch(base+'/api/public/health'),health=await healthResponse.json()
assert.equal(healthResponse.status,200);assert.equal(health.status,'healthy')
assert.equal(health.releaseId,promotion.health.releaseId)
const statusResponse=await fetch(base+'/api/public/chatgpt-notice'),status=await statusResponse.json()
assert.equal(statusResponse.status,200);assert.equal(status.version,content.version);assert.equal(status.contentSha256,digest)
const pageResponse=await fetch(base+'/docs/chatgpt-notice'),html=await pageResponse.text()
assert.equal(pageResponse.status,200);assert.ok(html.includes(`data-chatgpt-notice-version="${content.version}"`));assert.ok(html.includes(content.title));assert.ok(html.includes('30-day notice period'))
const report={scope:'Verified local production in-platform publication; no external message or consent',releaseId:health.releaseId,imageId:app.Image,version:content.version,contentSha256:digest,publicHttpsProved:false,customerLinkingEnabled:false,externalMessagesSent:0,status:'prepared'}
mkdirSync(root,{recursive:true})
if(process.argv.includes('--execute')){
  const code=`import fs from 'node:fs';import path from 'node:path';const root=process.env.STORAGE_ROOT||'/app/upload';if(path.resolve(root)!=='/app/upload')throw new Error('Unexpected storage root');const namespace=path.join(root,'.metardu-system'),dir=path.join(namespace,'notices');for(const p of [namespace,dir]){if(!fs.existsSync(p))fs.mkdirSync(p,{mode:0o700});if(fs.lstatSync(p).isSymbolicLink()||!fs.lstatSync(p).isDirectory())throw new Error('Invalid notice directory')}const file=path.join(dir,${JSON.stringify(content.version+'.json')});let record;if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink())throw new Error('Invalid notice file');record=JSON.parse(fs.readFileSync(file,'utf8'));if(record.version!==${JSON.stringify(content.version)}||record.contentSha256!==${JSON.stringify(digest)}||record.publicationScope!=='in-platform')throw new Error('Existing publication differs; preserve it')}else{record={version:${JSON.stringify(content.version)},contentSha256:${JSON.stringify(digest)},publishedAt:new Date().toISOString(),publicationScope:'in-platform'};fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx',mode:0o600})}process.stdout.write(JSON.stringify(record))`
  const record=JSON.parse(docker(['exec','-i','metardu-app','node','--input-type=module'],code))
  const confirmed=await(await fetch(base+'/api/public/chatgpt-notice')).json()
  assert.equal(confirmed.publishedAt,record.publishedAt);assert.equal(confirmed.contentSha256,digest);assert.equal(confirmed.linkingConfigured,false)
  assert.equal(Date.parse(confirmed.eligibleAt)-Date.parse(record.publishedAt),30*24*60*60*1000)
  const mcp=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'publication-verification',version:'1'}}})});assert.equal(mcp.status,503)
  Object.assign(report,{status:'published',publishedAt:record.publishedAt,eligibleAt:confirmed.eligibleAt,remainingDays:confirmed.remainingDays,recordRetainedInUploadVolume:true,existingFilesOverwritten:false,mcpStatus:503})
}
writeFileSync(`${root}/publication.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
