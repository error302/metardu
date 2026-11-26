#!/usr/bin/env node
// Produce the reviewed non-secret identity for the isolated rehearsal service.
// Credentials are neither printed nor persisted.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertRehearsalServiceIdentity } from './rehearsal-database.mjs'

export const REHEARSAL_SERVICE_INSPECTOR_PATH='scripts/inspect-rehearsal-service.mjs'
export const DEFAULT_REHEARSAL_SERVICE_CONTAINER='metardu-release-rehearsal'
export const DEFAULT_REHEARSAL_SERVICE_IDENTITY_FILE='.cache/release-verify/rehearsal-service.json'

export function rehearsalServiceCliUsage() {
  return [
    'Usage: node scripts/inspect-rehearsal-service.mjs [--container <name>] [--output <path>]',
    '',
    `Container: --container or METARDU_REHEARSAL_CONTAINER (default: ${DEFAULT_REHEARSAL_SERVICE_CONTAINER})`,
    `Output: --output or METARDU_REHEARSAL_IDENTITY_FILE (default: ${DEFAULT_REHEARSAL_SERVICE_IDENTITY_FILE})`,
  ].join('\n')
}

function environmentValue(container,name) {
  const prefix=`${name}=`
  const entry=(container.Config?.Env??[]).find(value=>value.startsWith(prefix))
  return entry?.slice(prefix.length)
}

function dockerOutput(result) {
  return typeof result==='string'?result:result?.stdout??''
}

function defaultExecuteDocker(args) {
  const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:4*1024*1024})
  if(result.error||result.status!==0)throw new Error(`Docker ${args[0]} failed; sensitive diagnostics suppressed.`)
  return result.stdout.trim()
}

export async function deriveRehearsalServiceIdentity(container,{readMarker}={}) {
  assert.ok(container&&typeof container==='object'&&!Array.isArray(container),'The inspected rehearsal container is required.')
  assert.equal(typeof readMarker,'function','A read-only marker reader is required.')
  const database=environmentValue(container,'POSTGRES_DB')
  assert.match(database??'',/^[a-z_][a-z0-9_]{0,62}$/i,'The rehearsal container requires a simple POSTGRES_DB name.')

  const networks=Object.keys(container.NetworkSettings?.Networks??{})
  assert.equal(networks.length,1,'The rehearsal service must have one sole isolated network.')
  const bindings=container.NetworkSettings?.Ports?.['5432/tcp']??[]
  assert.equal(bindings.length,1,'The rehearsal service must have one sole loopback binding.')
  const binding=bindings[0]
  assert.equal(binding?.HostIp,'127.0.0.1','The rehearsal service must bind only to IPv4 loopback.')
  assert.equal(String(binding?.HostPort),'55433','The rehearsal service must use the reviewed loopback port.')

  const mounts=container.Mounts??[]
  assert.equal(mounts.length,1,'The rehearsal service must have one sole owned data mount.')
  const mount=mounts[0]
  assert.equal(mount?.Type,'volume','The rehearsal service data mount must be an owned volume.')
  assert.equal(mount?.Destination,'/var/lib/postgresql/data','The rehearsal service data mount is unexpected.')

  const marker=await readMarker({containerId:container.Id,database})
  const identity={
    container:String(container.Name??'').replace(/^\//,''),
    containerId:container.Id,
    purpose:container.Config?.Labels?.['metardu.purpose'],
    network:networks[0],
    hostIp:binding.HostIp,
    hostPort:Number(binding.HostPort),
    database,
    marker,
    volume:mount.Name,
  }
  assertRehearsalServiceIdentity(identity,container)
  return identity
}

export function writeRehearsalServiceIdentityAtomic(output,identity) {
  const destination=resolve(output)
  mkdirSync(dirname(destination),{recursive:true})
  const temporary=`${destination}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary,JSON.stringify(identity,null,2)+'\n',{flag:'wx'})
    renameSync(temporary,destination)
  } finally {
    rmSync(temporary,{force:true})
  }
  return destination
}

async function readMarkerWithDocker(executeDocker,{containerId,database}) {
  assert.match(containerId??'',/^[a-f0-9]{64}$/,'The rehearsal marker query requires an exact container id.')
  assert.match(database??'',/^[a-z_][a-z0-9_]{0,62}$/i,'The rehearsal marker query requires a simple control database name.')
  const sql="SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()"
  const script=`export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${JSON.stringify(database)} -c ${JSON.stringify(sql)}`
  const output=dockerOutput(executeDocker(['exec',containerId,'sh','-c',script])).trim()
  assert.ok(output,'The rehearsal control database marker query returned no marker.')
  assert.ok(!output.includes('\n'),'The rehearsal control database marker query returned ambiguous evidence.')
  return output
}

export async function inspectRehearsalService({
  containerName=process.env.METARDU_REHEARSAL_CONTAINER??DEFAULT_REHEARSAL_SERVICE_CONTAINER,
  output=process.env.METARDU_REHEARSAL_IDENTITY_FILE??DEFAULT_REHEARSAL_SERVICE_IDENTITY_FILE,
  executeDocker=defaultExecuteDocker,
  readMarker,
  writeOutput=writeRehearsalServiceIdentityAtomic,
}={}) {
  assert.match(containerName??'',/^[a-z0-9][a-z0-9_.-]{0,127}$/,'A valid rehearsal container name is required.')
  const inspected=JSON.parse(dockerOutput(executeDocker(['inspect',containerName])))
  assert.equal(inspected?.length,1,'The configured rehearsal container must resolve to exactly one container.')
  const markerReader=readMarker??(request=>readMarkerWithDocker(executeDocker,request))
  const identity=await deriveRehearsalServiceIdentity(inspected[0],{readMarker:markerReader})
  const destination=writeOutput(resolve(output),identity)
  return {identity,output:destination}
}

function parseArguments(argv) {
  let containerName=process.env.METARDU_REHEARSAL_CONTAINER??DEFAULT_REHEARSAL_SERVICE_CONTAINER
  let output=process.env.METARDU_REHEARSAL_IDENTITY_FILE??DEFAULT_REHEARSAL_SERVICE_IDENTITY_FILE
  for(let index=0;index<argv.length;index+=1) {
    const argument=argv[index]
    if(argument==='--help'||argument==='-h')return {help:true}
    if(argument==='--container') {
      containerName=argv[index+1]
      index+=1
      continue
    }
    if(argument==='--output') {
      output=argv[index+1]
      index+=1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }
  assert.ok(containerName,'--container requires a container name.')
  assert.ok(output,'--output requires a file path.')
  return {containerName,output}
}

async function main() {
  const options=parseArguments(process.argv.slice(2))
  if(options.help) {
    console.log(rehearsalServiceCliUsage())
    return
  }
  const result=await inspectRehearsalService(options)
  console.log(JSON.stringify({status:'passed',path:result.output,container:result.identity.container,containerId:result.identity.containerId}))
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{
    console.error(`Rehearsal service inspection failed: ${error instanceof assert.AssertionError?'verification failed':'producer error'}`)
    process.exitCode=1
  })
}
