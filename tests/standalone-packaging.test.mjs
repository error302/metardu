import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { standalonePaths, assertBuildDestination, assertNoBundledEnvironmentFiles, removeBundledEnvironmentFiles } from '../scripts/standalone-paths.mjs'
import * as packaging from '../scripts/standalone-paths.mjs'
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

for (const dist of ['.next', path.join('build-output','isolated')]) {
 test(`browser assets are copied to the directory selected by the standalone runtime: ${dist}`,()=>{
  const root=fixture(dist==='.next'?'assets-default':'assets-nested')
  const {build,standalone}=standalonePaths(root,dist)
  mkdirSync(path.join(build,'static/chunks'),{recursive:true})
  mkdirSync(path.join(standalone,dist,'static'),{recursive:true})
  writeFileSync(path.join(build,'static/chunks/app.js'),'synthetic browser chunk\n')
  writeFileSync(path.join(standalone,dist,'static/stale.js'),'obsolete generated chunk\n')
  assert.equal(typeof packaging.copyStandaloneStaticAssets,'function')
  const result=packaging.copyStandaloneStaticAssets(root,dist)
  assert.equal(result.target,path.join(standalone,dist,'static'))
  assert.equal(readFileSync(path.join(standalone,dist,'static/chunks/app.js'),'utf8'),'synthetic browser chunk\n')
  assert.equal(readFileSync(path.join(build,'static/chunks/app.js'),'utf8'),'synthetic browser chunk\n')
  assert.equal(existsSync(path.join(standalone,dist,'static/stale.js')),false)
  assert.equal(packaging.copyStandaloneStaticAssets(root,dist).target,result.target)
  // Running this tiny fixture reads the same runtime-relative path as Next's
  // generated server; it starts no listener and uses no application data.
  writeFileSync(path.join(standalone,'read-asset.cjs'),`const fs=require('node:fs'),path=require('node:path');const config=${JSON.stringify({distDir:dist})};process.stdout.write(fs.readFileSync(path.join(__dirname,config.distDir,'static/chunks/app.js'),'utf8'))`)
  const runtime=spawnSync(process.execPath,[path.join(standalone,'read-asset.cjs')],{encoding:'utf8',windowsHide:true,timeout:10000})
  assert.equal(runtime.status,0,runtime.stderr)
  assert.equal(runtime.stdout,'synthetic browser chunk\n')
 })
}

test('missing browser assets refuse preparation rather than retaining a stale successful-looking package',()=>{
 const root=fixture('assets-missing')
 assert.throws(()=>packaging.copyStandaloneStaticAssets(root),/static assets.*missing/i)
})
