// Exercise the existing image's actual startup verifier on synthetic schema.
// No app server, customer clone, new container, image or builder is created.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readdirSync} from 'node:fs'
import {pinnedRehearsalIdentity,assertRehearsalServiceIdentity} from './rehearsal-database.mjs'
// String.raw preserves the regular-expression escapes when sent to node -e.
export const cleanupRegistryScript=String.raw`const fs=require('node:fs'),path=require('node:path'),root=process.argv[1];if(!/^\/tmp\/metardu-release-registry-[a-f0-9]{40}$/.test(root))throw Error('Unexpected artifact root');let rootStat;try{rootStat=fs.lstatSync(root)}catch(error){if(error?.code!=='ENOENT')throw error;rootStat=null}if(rootStat){if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw Error('Unexpected artifact root');const names=fs.readdirSync(root);for(const name of names){const p=path.join(root,name);if(!/^[0-9]+_[a-z0-9_]+\.sql$/.test(name)||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('Unexpected verification artifact')}for(const name of names)fs.unlinkSync(path.join(root,name));fs.rmdirSync(root)}`
export function rollbackRegistryTarget(revision) {
  assert.match(revision,/^[a-f0-9]{40}$/,'Rollback registry target requires a full source revision.')
  return `/tmp/metardu-release-registry-${revision}`
}
export function runRollbackRegistryVerification({app,fixture,registry,revision,runtimeUrl,isolatedBaseline=false,service,executeDocker}) {
  assert.equal(typeof executeDocker,'function','A Docker command runner is required.')
  const docker=(args,phase=args[0])=>executeDocker(args,phase)
  assert.equal(app.Name,'/metardu-app')
  assertRehearsalServiceIdentity(service,fixture)
  const network=Object.keys(app.NetworkSettings.Networks)[0]
  const inspected=JSON.parse(docker(['network','inspect',network]))[0]
  assert.equal(inspected.Labels['com.docker.compose.project'],app.Config.Labels['com.docker.compose.project'])
  const connected=Object.hasOwn(fixture.NetworkSettings.Networks,network)
  const target=rollbackRegistryTarget(revision)
  const present=docker(['exec','metardu-app','node','-e',"process.stdout.write(String(require('node:fs').existsSync(process.argv[1])))",target])
  assert.equal(present,'false','Inspect an existing owned verification artifact before reuse.')
  const address=new URL(runtimeUrl);assert.equal(address.hostname,'127.0.0.1');assert.equal(address.port,'55433')
  if(isolatedBaseline){
    const identity=pinnedRehearsalIdentity(revision)
    assert.equal(address.pathname,'/'+identity.database);assert.equal(address.username,identity.runtimeRole)
  }else assert.equal(address.pathname,'/' + service.database)
  address.hostname=fixture.Name.slice(1);address.port='5432'
  let copyAttempted=false,attached=false,primaryError=null,result
  try {
    if(!connected){docker(['network','connect',network,fixture.Id]);attached=true}
    copyAttempted=true
    docker(['cp',registry,`metardu-app:${target}`])
    docker(['exec','-e',`DATABASE_URL=${address.toString()}`,'-e',`MIGRATIONS_DIR=${target}`,'-e','NODE_ENV=production','metardu-app','node','/app/verify-migrations.mjs'],'strict-startup-verification')
    result={passed:true,actualExistingImage:app.Image,strictStartupVerifier:true,sourceVersions:readdirSync(registry).filter(n=>n.endsWith('.sql')).length,syntheticDatabase:true,newApplication:false}
  } catch(error) {primaryError=error}
  let cleanupError=null,verificationError=null,disconnectError=null
  if(copyAttempted) {
    try {
      // docker cp creates a root-owned directory. Only cleanup uses root; the
      // startup verification above still runs as the normal application user.
      docker(['exec','--user','0','metardu-app','node','-e',cleanupRegistryScript,target],'owned-SQL-cleanup')
    } catch(error) {cleanupError=error}
    try {
      const presentAfter=docker(['exec','metardu-app','node','-e',"process.stdout.write(String(require('node:fs').existsSync(process.argv[1])))",target],'owned-SQL-cleanup-verification')
      assert.equal(presentAfter,'false','Owned SQL verification artifact must be absent after cleanup.')
    } catch(error) {verificationError=error}
  }
  if(attached)try{docker(['network','disconnect',network,fixture.Id],'synthetic-network-disconnect')}catch(error){disconnectError=error}
  if(primaryError) {
    if(cleanupError)primaryError.cleanupError=cleanupError
    if(verificationError)primaryError.cleanupVerificationError=verificationError
    if(disconnectError)primaryError.networkDisconnectError=disconnectError
    throw primaryError
  }
  if(cleanupError)throw cleanupError
  if(verificationError)throw verificationError
  if(disconnectError)throw disconnectError
  return result
}
export function verifyRollbackRegistry(options) {
  const executeDocker=options.executeDocker ?? ((args,phase=args[0])=>{
    const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024})
    assert.equal(result.status,0,`Rollback verifier ${phase} failed (exit ${result.status}); diagnostic payload withheld.`)
    return result.stdout.trim()
  })
  return runRollbackRegistryVerification({...options,executeDocker})
}
