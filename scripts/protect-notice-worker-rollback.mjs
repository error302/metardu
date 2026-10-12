import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const root='test-results/notice-worker-release',baseline='sha256:0e488fe044a9892a4a10ef802d05387a8f1ae58adfc46d2f28278c031a44f080'
const baselineTag='metardu-metardu-app:rollback-notice-worker-baseline-verified',currentTag='metardu-metardu-app:rollback-current'
assert.equal(process.argv.length,3);assert.ok(['--baseline','--current'].includes(process.argv[2]))
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,'Rollback inspection failed; private diagnostics suppressed');return result.stdout.trim()}
const app=JSON.parse(docker(['inspect','metardu-app']))[0]
assert.equal(app.State.Health.Status,'healthy')
assert.ok(app.Config.Env.includes('METARDU_MCP_ENABLED=false'))
if(process.argv[2]==='--baseline'){
  assert.equal(app.Image,baseline)
  const http=JSON.parse(readFileSync('test-results/workflow-source-release/normal-account-http.json','utf8'))
  assert.equal(http.imageId,baseline);assert.equal(http.status,'passed');assert.equal(http.expectedChecks,35);assert.equal(http.checks.length,35);assert.ok(http.checks.every(check=>check.passed===true))
  const prior=spawnSync('docker',['image','inspect',baselineTag,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true,timeout:30000})
  if(prior.status===0)assert.equal(prior.stdout.trim(),baseline)
  assert.equal(docker(['image','inspect',currentTag,'--format','{{.Id}}']),baseline)
  docker(['image','tag',baseline,baselineTag])
  assert.equal(docker(['image','inspect',baselineTag,'--format','{{.Id}}']),baseline)
  console.log('Verified workflow baseline retained under the notice-worker rollback alias.')
}else{
  const promotion=JSON.parse(readFileSync(`${root}/promotion.json`,'utf8')),http=JSON.parse(readFileSync(`${root}/normal-account-http.json`,'utf8'))
  const publication=JSON.parse(readFileSync('test-results/chatgpt-notice-publication/publication.json','utf8')),backup=JSON.parse(readFileSync('test-results/chatgpt-notice-publication/backup.json','utf8'))
  assert.equal(promotion.status,'promoted');assert.equal(app.Image,promotion.applicationAfter.image);assert.equal(http.imageId,app.Image);assert.equal(http.status,'passed');assert.equal(http.expectedChecks,46);assert.equal(http.checks.length,46);assert.ok(http.checks.every(check=>check.passed===true));assert.equal(http.cleanup.syntheticAccountsDisabled,true);assert.equal(http.cleanup.syntheticUploadRemoved,true)
  assert.equal(publication.status,'published');assert.equal(publication.imageId,app.Image);assert.equal(publication.customerLinkingEnabled,false);assert.equal(backup.imageId,app.Image);assert.equal(backup.noticeRecordExtractedAndMatched,true)
  assert.equal(docker(['image','inspect',baselineTag,'--format','{{.Id}}']),baseline)
  const current=docker(['image','inspect',currentTag,'--format','{{.Id}}']);assert.ok([baseline,app.Image].includes(current))
  docker(['image','tag',app.Image,currentTag]);assert.equal(docker(['image','inspect',currentTag,'--format','{{.Id}}']),app.Image)
  const proof={recordedAt:new Date().toISOString(),currentImage:app.Image,currentTag,baselineImage:baseline,baselineTag,baselinePreserved:true,normalAccountChecks:46,customerMcpEnabled:false,noticeRecordBackedUp:true,imagesRemoved:0,volumesRemoved:0,containersCreated:0}
  writeFileSync(`${root}/rollback-readiness.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2))
}
