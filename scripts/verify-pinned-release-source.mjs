// Test a committed source artifact; no checkout, package install, app or container.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,existsSync,writeFileSync,readFileSync,createWriteStream,statfsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {pinnedReleaseArguments} from './release-plan.mjs'
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const revision=process.argv[2],unified=process.argv[3]==='--unified'
assert.match(revision??'',/^[a-f0-9]{40}$/)
const {directory:evidence}=pinnedReleaseArguments(['build',revision,...process.argv.slice(3)],workspace)
const base=unified?JSON.parse(readFileSync(path.join(evidence,'promotion.json'),'utf8')).priorRevision:'c1591bda793e415d300f7f58176e1ced8c020f6b'
const source=unified?workspace:path.join(evidence,'source',revision)
mkdirSync(evidence,{recursive:true})
const report={revision,baseline:base,status:'checking',artifact:source,packageInstall:false,applicationStarted:false,containerCreated:false,checks:[]}
const save=()=>writeFileSync(path.join(evidence,'source-checks.json'),JSON.stringify(report,null,2))
const git=args=>{const r=spawnSync('git',['-c','core.fsmonitor=false',...args],{cwd:workspace,encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout.trim()}
assert.equal(git(['rev-parse',revision]),revision)
function assertPinnedCheckout(){assert.equal(git(['rev-parse','HEAD']),revision);assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Committed source checks require a clean tracked checkout.')}
if(unified)assertPinnedCheckout()
const stats=statfsSync(workspace);assert.ok(stats.bavail*stats.bsize>8*1024**3)
if(!unified&&!existsSync(source)) {
  mkdirSync(source,{recursive:true})
  const archive=spawn('git',['-c','core.fsmonitor=false','archive','--format=tar',revision],{cwd:workspace,windowsHide:true,stdio:['ignore','pipe','ignore']})
  const extract=spawn('tar',['-xf','-','-C',source],{cwd:workspace,windowsHide:true,stdio:['pipe','ignore','inherit']})
  archive.stdout.pipe(extract.stdin)
  await Promise.all([archive,extract].map(child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Pinned source artifact extraction failed.')))})))
  writeFileSync(path.join(source,'.release-source-revision'),revision)
}
if(!unified)assert.equal(readFileSync(path.join(source,'.release-source-revision'),'utf8'),revision)
// Source typing precedes Next's generated route validation, which the production
// image build performs separately. Compiler options remain fully strict.
if(!unified)writeFileSync(path.join(source,'next-env.d.ts'),'/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n')
const changed=git(['diff','--name-only','--diff-filter=ACMRT',base,revision,'--','*.ts','*.tsx']).split('\n').filter(Boolean)
const node=process.execPath,nm=path.join(workspace,'node_modules')
async function check(name,args) {
  const logPath=path.join(evidence,`source-${name}.log`),log=createWriteStream(logPath)
  const child=spawn(node,args,{cwd:source,windowsHide:true,env:{...process.env,CI:'true',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']})
  report.active={name,pid:child.pid,log:logPath};save();console.log(`START ${name}`)
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false})
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
  await new Promise(resolve=>log.end(resolve))
  report.checks.push({name,passed:exit===0,exit,log:logPath});delete report.active;save()
  assert.equal(exit,0,`Pinned ${name} failed; inspect its source log.`);console.log(`PASS ${name}`)
}
try {
  await check('app-types',[path.join(nm,'typescript/bin/tsc'),'--noEmit','--project','tsconfig.json'])
  await check('test-types',[path.join(nm,'typescript/bin/tsc'),'--noEmit','--project','tsconfig.tests.json'])
  if(unified)await check('release-contracts',['--test','tests/release-plan.test.mjs','tests/field-observation-contract.test.mjs','tests/workflow-upgrade.test.mjs','tests/release-row-snapshot.test.mjs','tests/schedule-release-contract.test.mjs','tests/lint-batches.test.mjs'])
  if(unified) {
    await check('tool-types',[path.join(nm,'typescript/bin/tsc'),'--noEmit','--project','tsconfig.lint-owned.json'])
    // Let Jest obtain the complete pinned Git diff itself. Passing the 999
    // production-to-source paths exceeded Windows' command-line limit.
    await check('related-tests',[path.join(nm,'jest/bin/jest.js'),'--maxWorkers=2','--config',path.join(source,'jest.config.js'),'--changedSince',base])
    // The bounded owned-file scan preserves complete coverage without a large
    // argv or one unbounded TypeScript/ESLint process. Baselines stay blocking.
    await check('whole-lint',['scripts/lint-ratchets.mjs'])
  } else {
    await check('related-tests',[path.join(nm,'jest/bin/jest.js'),'--runInBand','--config',path.join(source,'jest.config.js'),'--findRelatedTests',...changed])
    await check('changed-lint',[path.join(nm,'eslint/bin/eslint.js'),...changed])
  }
  if(unified)assertPinnedCheckout()
  report.status='passed';report.changedFiles=changed.length;save()
} catch(error) {report.status='failed';save();throw error}
