// Test a committed source artifact; no checkout, package install, app or container.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,existsSync,writeFileSync,readFileSync,createWriteStream,statfsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {pinnedReleaseArguments} from './release-plan.mjs'
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const revision=process.argv[2],unified=process.argv[3]==='--unified'
assert.match(revision??'',/^[a-f0-9]{40}$/)
const {directory:evidence}=pinnedReleaseArguments(['build',revision,...process.argv.slice(3)],workspace)
const base=unified?JSON.parse(readFileSync(path.join(evidence,'promotion.json'),'utf8')).priorRevision:'c1591bda793e415d300f7f58176e1ced8c020f6b'
const archivedUnified=unified&&process.env.METARDU_VERIFY_COMMITTED_ARCHIVE==='1'
const fromArchive=!unified||archivedUnified
const requireCheckout=unified&&!archivedUnified
mkdirSync(evidence,{recursive:true})
const source=archivedUnified?mkdtempSync(path.join(evidence,'pinned-source-')):unified?workspace:path.join(evidence,'source',revision)
const report={revision,baseline:base,status:'checking',artifact:source,sourceMode:fromArchive?'git-archive':'checkout',packageInstall:false,applicationStarted:false,containerCreated:false,checks:[]}
const save=()=>writeFileSync(path.join(evidence,'source-checks.json'),JSON.stringify(report,null,2))
const git=args=>{const r=spawnSync('git',['-c','core.fsmonitor=false',...args],{cwd:workspace,encoding:'utf8',windowsHide:true});assert.equal(r.status,0);return r.stdout.trim()}
assert.equal(git(['rev-parse',revision]),revision)
function assertPinnedCheckout(){assert.equal(git(['rev-parse','HEAD']),revision);assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Committed source checks require a clean tracked checkout.')}
if(requireCheckout)assertPinnedCheckout()
const stats=statfsSync(workspace);assert.ok(stats.bavail*stats.bsize>8*1024**3)
if(archivedUnified||(!unified&&!existsSync(source))) {
  mkdirSync(source,{recursive:true})
  const archive=spawn('git',['-c','core.fsmonitor=false','archive','--format=tar',revision],{cwd:workspace,windowsHide:true,stdio:['ignore','pipe','ignore']})
  const extract=spawn('tar',['-xf','-','-C',source],{cwd:workspace,windowsHide:true,stdio:['pipe','ignore','inherit']})
  archive.stdout.pipe(extract.stdin)
  await Promise.all([archive,extract].map(child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Pinned source artifact extraction failed.')))})))
  writeFileSync(path.join(source,'.release-source-revision'),revision)
}
if(fromArchive)assert.equal(readFileSync(path.join(source,'.release-source-revision'),'utf8'),revision)
// Source typing precedes Next's generated route validation, which the production
// image build performs separately. Compiler options remain fully strict.
if(fromArchive)writeFileSync(path.join(source,'next-env.d.ts'),'/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n')
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
  if(unified)await check('release-contracts',['--test','tests/migration-logic-isolation.test.mjs','tests/release-plan.test.mjs','tests/release-build-retry.test.mjs','tests/survey-upgrade.test.mjs','tests/workflow-upgrade.test.mjs','tests/release-row-snapshot.test.mjs','scripts/worker-runtime-contract.test.mjs','tests/recovery-scripts.test.mjs','tests/legacy-migration-entrypoint.test.mjs','tests/schedule-release-contract.test.mjs','tests/field-observation-contract.test.mjs','tests/lint-batches.test.mjs','tests/collaboration-release.test.mjs'])
  if(unified) {
    await check('tool-types',[path.join(nm,'typescript/bin/tsc'),'--noEmit','--project','tsconfig.lint-owned.json'])
    // Let Jest obtain the complete pinned Git diff itself. Passing the 999
    // production-to-source paths exceeded Windows' command-line limit.
    const related=[path.join(nm,'jest/bin/jest.js'),'--maxWorkers=2','--config',path.join(source,'jest.config.js')]
    if(archivedUnified) {
      assert.ok(changed.length>0,'An archived release must have an explicit related-test inventory.')
      const testPaths=changed.map(file=>path.join(source,file))
      // Bound Windows process arguments without omitting any changed source file.
      for(let offset=0;offset<testPaths.length;offset+=60) {
        const name=offset===0?'related-tests':`related-tests-${offset/60+1}`
        await check(name,[...related,'--findRelatedTests',...testPaths.slice(offset,offset+60)])
      }
      const inventory=git(['ls-tree','-r','--name-only','-z',revision]).split('\0')
        .filter(file=>/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)&&!/^(?:\.claude|docs)\//.test(file))
      assert.ok(inventory.length>0&&inventory.every(file=>!file.includes(',')&&existsSync(path.join(source,file))))
      const inventoryPath=path.join(evidence,'source-lint-inventory.json')
      const inventoryBytes=JSON.stringify(inventory)
      writeFileSync(inventoryPath,inventoryBytes)
      report.lintInventory={path:inventoryPath,files:inventory.length,sha256:createHash('sha256').update(inventoryBytes).digest('hex')}
      // Pass the pinned inventory inside Node to avoid Windows argv limits.
      const lint=`import {readFileSync} from 'node:fs';
        const scope=JSON.parse(readFileSync(process.argv[1],'utf8'));
        process.argv.splice(1,1,'scripts/lint-ratchets.mjs','--scope',scope.join(','));
        await import('./scripts/lint-ratchets.mjs');`
      await check('whole-lint',['--input-type=module','--eval',lint,inventoryPath])
    } else {
      await check('related-tests',[...related,'--changedSince',base])
      await check('whole-lint',['scripts/lint-ratchets.mjs'])
    }
  } else {
    await check('related-tests',[path.join(nm,'jest/bin/jest.js'),'--runInBand','--config',path.join(source,'jest.config.js'),'--findRelatedTests',...changed])
    await check('changed-lint',[path.join(nm,'eslint/bin/eslint.js'),...changed])
  }
  if(requireCheckout)assertPinnedCheckout()
  report.status='passed';report.changedFiles=changed.length;save()
} catch(error) {report.status='failed';save();throw error}
