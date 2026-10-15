// Exercise the existing image's actual startup verifier on synthetic schema.
// No app server, customer clone, new container, image or builder is created.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readdirSync} from 'node:fs'
// String.raw preserves the regular-expression escapes when sent to node -e.
export const cleanupRegistryScript=String.raw`const fs=require('node:fs'),path=require('node:path'),root=process.argv[1];if(!/^\/tmp\/metardu-release-registry-[a-f0-9]{40}$/.test(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())throw Error('Unexpected artifact root');const names=fs.readdirSync(root);for(const name of names){const p=path.join(root,name);if(!/^[0-9]+_[a-z0-9_]+\.sql$/.test(name)||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('Unexpected verification artifact')}for(const name of names)fs.unlinkSync(path.join(root,name));fs.rmdirSync(root);`
export function verifyRollbackRegistry({app,fixture,registry,revision,runtimeUrl}) {
  const docker=(args,phase=args[0])=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});assert.equal(r.status,0,`Rollback verifier ${phase} failed (exit ${r.status}); diagnostic payload withheld.`);return r.stdout.trim()}
  assert.equal(app.Name,'/metardu-app');assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal')
  assert.equal(fixture.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
  const network=Object.keys(app.NetworkSettings.Networks)[0]
  const inspected=JSON.parse(docker(['network','inspect',network]))[0]
  assert.equal(inspected.Labels['com.docker.compose.project'],app.Config.Labels['com.docker.compose.project'])
  const connected=Object.hasOwn(fixture.NetworkSettings.Networks,network)
  assert.match(revision,/^[a-f0-9]{40}$/)
  const target=`/tmp/metardu-release-registry-${revision}`
  const present=docker(['exec','metardu-app','node','-e',"process.stdout.write(String(require('node:fs').existsSync(process.argv[1])))",target])
  assert.equal(present,'false','Inspect an existing owned verification artifact before reuse.')
  const address=new URL(runtimeUrl);assert.equal(address.pathname,'/metardu_runtime_verify');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.port,'55433')
  address.hostname=fixture.Name.slice(1);address.port='5432'
  let copied=false,attached=false
  try {
    if(!connected){docker(['network','connect',network,fixture.Id]);attached=true}
    docker(['cp',registry,`metardu-app:${target}`]);copied=true
    docker(['exec','-e',`DATABASE_URL=${address.toString()}`,'-e',`MIGRATIONS_DIR=${target}`,'-e','NODE_ENV=production','metardu-app','node','/app/verify-migrations.mjs'],'strict-startup-verification')
    return {passed:true,actualExistingImage:app.Image,strictStartupVerifier:true,sourceVersions:readdirSync(registry).filter(n=>n.endsWith('.sql')).length,syntheticDatabase:true,newApplication:false}
  } finally {
    try {
      // docker cp creates a root-owned directory. Only cleanup uses root; the
      // startup verification above still runs as the normal application user.
      if(copied)docker(['exec','--user','0','metardu-app','node','-e',cleanupRegistryScript,target],'owned-SQL-cleanup')
    } finally {
      if(attached)docker(['network','disconnect',network,fixture.Id],'synthetic-network-disconnect')
    }
  }
}
