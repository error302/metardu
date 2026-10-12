import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { standalonePaths, assertBuildDestination, assertNoBundledEnvironmentFiles, removeBundledEnvironmentFiles } from '../scripts/standalone-paths.mjs'
mkdirSync(path.join(process.cwd(),'.cache/release-verify'),{recursive:true})
const base=mkdtempSync(path.join(process.cwd(),'.cache/release-verify/standalone-packaging-'))
function fixture(name){const root=path.join(base,name);mkdirSync(path.join(root,'.next/standalone'),{recursive:true});return root}

test('build destinations reject traversal and respect the selected build directory',()=>{
 const root=fixture('paths')
 assert.throws(()=>standalonePaths(root,'../outside'))
 assert.throws(()=>assertBuildDestination(root,root))
 assert.equal(standalonePaths(root,'.next-analysis').standalone,path.join(root,'.next-analysis/standalone'))
})
test('an ancestor junction cannot escape the owned project',context=>{
 const root=fixture('junction'),outside=fixture('outside')
 try{symlinkSync(outside,path.join(root,'linked'),process.platform==='win32'?'junction':'dir')}
 catch(error){if(process.platform==='win32'&&error.code==='EPERM'){context.skip('Windows sandbox prevents creating the test junction; Linux build must exercise this case');return}throw error}
 assert.throws(()=>assertBuildDestination(root,path.join(root,'linked','output')))
})

test('stale bundled dotenv files block release without deleting their contents',()=>{
 const root=fixture('stale'), output=path.join(root,'.next/standalone')
 writeFileSync(path.join(output,'.env.local'),'METARDU_SYNTHETIC_ONLY=preserved\n')
 assert.throws(()=>assertNoBundledEnvironmentFiles(output),/environment files/)
 assert.equal(readFileSync(path.join(output,'.env.local'),'utf8'),'METARDU_SYNTHETIC_ONLY=preserved\n')
})

test('release preparation removes only generated dotenv copies and preserves source configuration',()=>{
 const root=fixture('dotenv-cleanup'),output=path.join(root,'.next/standalone')
 writeFileSync(path.join(root,'.env'),'METARDU_SYNTHETIC_ONLY=source-value\n')
 writeFileSync(path.join(output,'.env'),'METARDU_SYNTHETIC_ONLY=generated-copy\n')
 writeFileSync(path.join(output,'.env.production'),'METARDU_SYNTHETIC_ONLY=generated-production-copy\n')
 writeFileSync(path.join(output,'server.js'),'runtime')
 assert.deepEqual(removeBundledEnvironmentFiles(output),['.env','.env.production'])
 assertNoBundledEnvironmentFiles(output)
 assert.equal(readFileSync(path.join(output,'server.js'),'utf8'),'runtime')
 assert.equal(readFileSync(path.join(root,'.env'),'utf8'),'METARDU_SYNTHETIC_ONLY=source-value\n')
})

test('the actual launcher loads source runtime env without copying it into the build',()=>{
 const root=fixture('launch');mkdirSync(path.join(root,'scripts'))
 for(const name of ['start-standalone.mjs','standalone-paths.mjs'])cpSync(path.join('scripts',name),path.join(root,'scripts',name))
 writeFileSync(path.join(root,'.env.local'),'METARDU_SYNTHETIC_ONLY=source-only\nMETARDU_SYNTHETIC_OVERRIDE=file-value\n')
 writeFileSync(path.join(root,'.next/standalone/server.js'),`process.stdout.write(JSON.stringify({loaded:process.env.METARDU_SYNTHETIC_ONLY==='source-only',override:process.env.METARDU_SYNTHETIC_OVERRIDE==='operator-value',production:process.env.NODE_ENV==='production'}))`)
 const result=spawnSync(process.execPath,[path.join(root,'scripts/start-standalone.mjs')],{cwd:base,encoding:'utf8',env:{...process.env,METARDU_SYNTHETIC_OVERRIDE:'operator-value',METARDU_NEXT_DIST_DIR:'.next'},timeout:10000})
 assert.equal(result.status,0,result.stderr)
 assert.deepEqual(JSON.parse(result.stdout),{loaded:true,override:true,production:true})
 assertNoBundledEnvironmentFiles(path.join(root,'.next/standalone'))
 assert.match(readFileSync(path.join(root,'.env.local'),'utf8'),/source-only/)
})
