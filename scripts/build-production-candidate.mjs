// One reusable image tag, existing default builder, no application container.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
const tag='metardu-metardu-app:candidate'
const connectorSource=process.argv.includes('--connector-source')
const workflowSource=process.argv.includes('--workflow-source')
const noticeWorkerSource=process.argv.includes('--notice-worker-source')
if([connectorSource,workflowSource,noticeWorkerSource].filter(Boolean).length>1)throw new Error('Choose one release evidence namespace.')
const evidenceRoot=noticeWorkerSource?'test-results/notice-worker-release':workflowSource?'test-results/workflow-source-release':connectorSource?'test-results/connector-source-release':'test-results/production-upgrade'
const buildLog=noticeWorkerSource?'.cache/release-verify/notice-worker-candidate-build.log':workflowSource?'.cache/release-verify/workflow-source-candidate-build.log':connectorSource?'.cache/release-verify/connector-source-candidate-build.log':'.cache/release-verify/production-candidate-build.log'
const result=spawnSync('docker',['compose','-f','docker-compose.yml','config','--format','json'],{encoding:'utf8',windowsHide:true})
if(result.status!==0)throw new Error('Compose configuration incomplete; credential output suppressed.')
const config=JSON.parse(result.stdout)
const args=config.services['metardu-app'].build.args
const hash=createHash('sha256')
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.isFile()&&!/\.(test|spec)\./.test(entry.name)){hash.update(path.replaceAll('\\','/'));hash.update(readFileSync(path))}}}
walk('src')
for(const file of ['package.json','package-lock.json','Dockerfile','docker-entrypoint.sh','next.config.js']){hash.update(file);hash.update(readFileSync(file))}
if(workflowSource||noticeWorkerSource)for(const file of ['scripts/prepare-standalone.mjs','public/metardu-icon.png','public/fonts/JetBrainsMono-Regular.ttf','public/fonts/JetBrainsMono-coverage.json','public/fonts/JetBrainsMono-OFL.txt']){hash.update(file);hash.update(readFileSync(file))}
const sourceSha256=hash.digest('hex')
mkdirSync(evidenceRoot,{recursive:true})
writeFileSync(`${evidenceRoot}/candidate-build.json`,JSON.stringify({imageTag:tag,sourceSha256,productionStopped:false,newApplicationContainer:false,newBuilder:false,status:'building'},null,2)+'\n')
const log=createWriteStream(buildLog)
const command=['build','--builder','desktop-linux','--progress','plain','--tag',tag,'--build-arg',`NEXT_PUBLIC_APP_URL=${args.NEXT_PUBLIC_APP_URL}`]
if(args.NEXT_PUBLIC_PAYPAL_CLIENT_ID)command.push('--build-arg',`NEXT_PUBLIC_PAYPAL_CLIENT_ID=${args.NEXT_PUBLIC_PAYPAL_CLIENT_ID}`)
command.push('.')
const child=spawn('docker',command,{windowsHide:true,stdio:['ignore','pipe','pipe']})
child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false})
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)})
await new Promise(resolve=>log.end(resolve))
const report={imageTag:tag,sourceSha256,productionStopped:false,newApplicationContainer:false,newBuilder:false,status:exit===0?'built':'failed',exit}
if(exit===0){const inspected=spawnSync('docker',['image','inspect',tag,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true});if(inspected.status!==0)throw new Error('Candidate image inspection failed.');report.imageId=inspected.stdout.trim()}
writeFileSync(`${evidenceRoot}/candidate-build.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2));process.exitCode=exit??1
