#!/usr/bin/env node
// Reviewed, read-only producer for the one known unlabeled production image.
// It records migration metadata and runtime-role attributes only; credentials
// and customer rows are never printed or persisted.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { computeDrift, migrationChecksums } from './verify-migrations.mjs'
import {
  LEGACY_PREFLIGHT_PRODUCER_PATH,
  LEGACY_PREFLIGHT_SCHEMA_VERSION,
  assertLegacyPreflightArtifact,
  canonicalSourceSha256,
  collectLegacyPreflightLiveEvidence,
  legacyPreflightArtifactDigest,
} from './legacy-image-preflight-contract.mjs'

export * from './legacy-image-preflight-contract.mjs'

function command(binary,args,{rawOutput=false}={}) {
  const result=spawnSync(binary,args,{encoding:rawOutput?null:'utf8',windowsHide:true,timeout:30_000,maxBuffer:8*1024*1024})
  if(result.error||result.status!==0)throw new Error(`${binary} ${args[0]} failed; sensitive diagnostics suppressed.`)
  return rawOutput?result.stdout:result.stdout.trim()
}

function git(args,{rawOutput=false}={}) {
  return command('git',['-c','core.fsmonitor=false',...args],{rawOutput})
}

function environmentOf(container) {
  return Object.fromEntries((container.Config?.Env??[]).map(value=>{
    const index=value.indexOf('=')
    return [value.slice(0,index),value.slice(index+1)]
  }))
}

function candidateMigrations(revision) {
  const paths=git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).split('\n').filter(path=>path.endsWith('.sql')).sort()
  return paths.map(path=>{
    const content=git(['show',`${revision}:${path}`],{rawOutput:true})
    const version=path.split('/').at(-1).replace(/\.sql$/,'')
    return {version,path,content,...migrationChecksums(content)}
  })
}

async function productionLedger() {
  const postgres=JSON.parse(command('docker',['inspect','metardu-postgres']))[0]
  const environment=environmentOf(postgres)
  const binding=postgres.NetworkSettings?.Ports?.['5432/tcp']?.find(value=>value.HostIp==='127.0.0.1')
  assert.ok(binding,'The production database must be inspected on its loopback binding.')
  const client=new pg.Client({
    host:'127.0.0.1',
    port:Number(binding.HostPort),
    database:environment.POSTGRES_DB,
    user:environment.POSTGRES_USER,
    password:environment.POSTGRES_PASSWORD,
    connectionTimeoutMillis:5000,
    statement_timeout:5000,
  })
  await client.connect()
  try {
    const result=await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')
    return result.rows
  } finally {
    await client.end()
  }
}

export function writeLegacyPreflightArtifactAtomic(output,artifact) {
  const destination=resolve(output)
  mkdirSync(dirname(destination),{recursive:true})
  const temporary=`${destination}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary,JSON.stringify(artifact,null,2)+'\n',{flag:'wx'})
    renameSync(temporary,destination)
  } finally {
    rmSync(temporary,{force:true})
  }
  return destination
}

export async function produceLegacyImagePreflight({
  revision,
  output,
  executeCommand=command,
  readLedger=productionLedger,
  readCandidateSource=candidateMigrations,
  writeArtifact=writeLegacyPreflightArtifactAtomic,
  now=()=>new Date(),
}={}) {
  assert.match(revision??'',/^[a-f0-9]{40}$/,'Supply the exact candidate revision with --revision.')
  assert.equal(typeof executeCommand,'function','A command runner is required.')
  assert.equal(typeof readLedger,'function','A migration ledger reader is required.')
  assert.equal(typeof readCandidateSource,'function','A candidate migration source reader is required.')
  assert.equal(typeof writeArtifact,'function','An artifact writer is required.')

  const resolvedRevision=executeCommand('git',['-c','core.fsmonitor=false','rev-parse',revision]).trim()
  assert.equal(resolvedRevision,revision,'The candidate revision must exist in this repository.')
  const candidateProducer=executeCommand('git',['-c','core.fsmonitor=false','show',`${revision}:${LEGACY_PREFLIGHT_PRODUCER_PATH}`],{rawOutput:true})
  const producerSha256=canonicalSourceSha256(candidateProducer)
  const executedProducer=readFileSync(new URL(import.meta.url))
  assert.equal(canonicalSourceSha256(executedProducer),producerSha256,'The executed producer must match the pinned candidate source.')

  const app=JSON.parse(executeCommand('docker',['inspect','metardu-app']))[0]
  assert.equal(app.Name,'/metardu-app')
  assert.equal(app.State?.Running,true,'The legacy application container must be running.')
  const image=JSON.parse(executeCommand('docker',['image','inspect',app.Image]))[0]
  assert.equal(image.Id,app.Image,'The inspected legacy image must be the exact running image.')
  const labels=image.Config?.Labels??{}
  assert.equal(Object.hasOwn(labels,'org.opencontainers.image.revision'),false,'The legacy producer accepts only an unlabeled image.')
  const environment=environmentOf(app)
  const runtimeRevision=environment.METARDU_BUILD_SHA
  assert.match(runtimeRevision??'',/^[a-f0-9]{40}$/,'The legacy image requires a full runtime release identity.')

  const executeDocker=(args)=>{
    const stdout=executeCommand('docker',args)
    return {exitStatus:0,stdout:typeof stdout==='string'?stdout:Buffer.from(stdout).toString('utf8')}
  }
  const ledger=await readLedger()
  const files=await readCandidateSource(revision)
  const computed=computeDrift(files,ledger)
  const drift={missing:computed.missing,mutated:computed.mutated.map(value=>value.version),ghost:computed.ghost}
  const liveEvidence=collectLegacyPreflightLiveEvidence({
    app,
    image,
    runtimeRevision,
    ledger,
    drift,
    executeDocker,
  })
  const checkedAt=new Date(now()).toISOString()
  const artifact={
    schemaVersion:LEGACY_PREFLIGHT_SCHEMA_VERSION,
    status:'passed',
    checkedAt,
    candidateRevision:revision,
    producer:{path:LEGACY_PREFLIGHT_PRODUCER_PATH,sha256:producerSha256},
    containerId:app.Id,
    image:{id:image.Id,runtimeRevision,ociRevision:null},
    strictVerifier:liveEvidence.strictVerifier,
    runtimeRole:{passed:true,failure:null},
    ledger:{sha256:liveEvidence.ledgerSha256,appliedMigrationCount:liveEvidence.appliedMigrationCount},
    drift,
    readOnly:true,
    customerRowsRead:false,
  }
  artifact.artifactSha256=legacyPreflightArtifactDigest(artifact)
  assertLegacyPreflightArtifact(artifact,{
    expectedImageId:image.Id,
    expectedContainerId:app.Id,
    expectedRuntimeRevision:runtimeRevision,
    expectedCandidateRevision:revision,
    expectedProducerSha256:producerSha256,
    now:Date.parse(checkedAt),
  })
  const destination=resolve(output??process.env.METARDU_LEGACY_IMAGE_PREFLIGHT_FILE??`.cache/release-verify/mpesa-production/${runtimeRevision}/migration-preflight.json`)
  writeArtifact(destination,artifact)
  return {artifact,liveEvidence,output:destination}
}

async function produce() {
  const revisionIndex=process.argv.indexOf('--revision')
  const revision=revisionIndex>=0?process.argv[revisionIndex+1]:null
  assert.match(revision??'',/^[a-f0-9]{40}$/,'Supply the exact candidate revision with --revision.')
  const outputIndex=process.argv.indexOf('--output')
  const output=outputIndex>=0?process.argv[outputIndex+1]:null
  const result=await produceLegacyImagePreflight({revision,output})
  console.log(JSON.stringify({
    status:'passed',
    path:result.output,
    artifactSha256:result.artifact.artifactSha256,
    imageId:result.artifact.image.id,
    containerId:result.artifact.containerId,
    runtimeRevision:result.artifact.image.runtimeRevision,
    candidateRevision:result.artifact.candidateRevision,
    producerSha256:result.artifact.producer.sha256,
  }))
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  produce().catch(error=>{
    console.error(`Legacy image preflight failed: ${error instanceof assert.AssertionError?'verification failed':'producer error'}`)
    process.exitCode=1
  })
}
