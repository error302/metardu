import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import * as releasePlan from '../scripts/release-plan.mjs'

const inspector=await import('../scripts/inspect-rehearsal-service.mjs').catch(()=>({}))
function requiredFunction(name){
  const value=inspector[name]
  assert.equal(typeof value,'function',`Missing rehearsal service inspector contract: ${name}`)
  return value
}

const marker='METARDU synthetic release rehearsal only'
const containerId='a'.repeat(64)
function container(overrides={}){
  return {
    Id:containerId,
    Name:'/metardu-release-rehearsal',
    State:{Running:true},
    Config:{
      Labels:{'metardu.purpose':'schema-rehearsal'},
      Env:[
        'POSTGRES_DB=metardu_release_rehearsal',
        'POSTGRES_USER=release_verify',
        'POSTGRES_PASSWORD=synthetic-secret-never-persist',
      ],
    },
    NetworkSettings:{
      Networks:{'metardu-release-rehearsal':{}},
      Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]},
    },
    Mounts:[{Type:'volume',Name:'metardu_release_rehearsal_data',Destination:'/var/lib/postgresql/data'}],
    ...overrides,
  }
}
function expectedIdentity(){
  return {
    container:'metardu-release-rehearsal',
    containerId,
    purpose:'schema-rehearsal',
    network:'metardu-release-rehearsal',
    hostIp:'127.0.0.1',
    hostPort:55433,
    database:'metardu_release_rehearsal',
    marker,
    volume:'metardu_release_rehearsal_data',
  }
}

test('the inspected rehearsal identity is derived only from the isolated live container',async()=>{
  const derive=requiredFunction('deriveRehearsalServiceIdentity')
  const markerCalls=[]
  const identity=await derive(container(),{
    readMarker:async request=>{
      markerCalls.push(request)
      return marker
    },
  })
  assert.deepEqual(identity,expectedIdentity())
  assert.deepEqual(markerCalls,[{containerId,database:'metardu_release_rehearsal'}])
  assert.doesNotMatch(JSON.stringify(identity),/synthetic-secret-never-persist/)
})

test('production, Compose, non-loopback and ambiguous rehearsal identities are rejected',async()=>{
  const derive=requiredFunction('deriveRehearsalServiceIdentity')
  const readMarker=async()=>marker
  const cases=[
    container({Name:'/metardu-app'}),
    container({Config:{...container().Config,Labels:{...container().Config.Labels,'com.docker.compose.service':'metardu-app'}}}),
    container({NetworkSettings:{...container().NetworkSettings,Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'55433'}]}}}),
    container({NetworkSettings:{...container().NetworkSettings,Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'},{HostIp:'127.0.0.1',HostPort:'55434'}]}}}),
    container({NetworkSettings:{...container().NetworkSettings,Networks:{'metardu-release-rehearsal':{},metardu_default:{}}}}),
    container({Mounts:[...container().Mounts,{Type:'volume',Name:'other-volume',Destination:'/other'}]}),
    container({Config:{...container().Config,Env:container().Config.Env.filter(value=>!value.startsWith('POSTGRES_DB='))}}),
  ]
  for(const value of cases)await assert.rejects(()=>derive(value,{readMarker}))
  await assert.rejects(()=>derive(container(),{readMarker:async()=>'customer production marker'}),/synthetic|marker/i)
})

test('the rehearsal identity producer inspects the configured container and writes only the requested JSON',async()=>{
  const inspect=requiredFunction('inspectRehearsalService')
  const calls=[]
  let written
  const result=await inspect({
    containerName:'metardu-release-rehearsal',
    output:path.resolve('.cache/release-verify/test/rehearsal-service.json'),
    executeDocker:args=>{
      calls.push(args)
      return JSON.stringify([container()])
    },
    readMarker:async request=>{
      assert.deepEqual(request,{containerId,database:'metardu_release_rehearsal'})
      return marker
    },
    writeOutput:(output,identity)=>{written={output,identity}},
  })
  assert.deepEqual(result.identity,expectedIdentity())
  assert.deepEqual(calls,[['inspect','metardu-release-rehearsal']])
  assert.equal(written.output,path.resolve('.cache/release-verify/test/rehearsal-service.json'))
  assert.deepEqual(written.identity,expectedIdentity())
  assert.doesNotMatch(JSON.stringify(written.identity),/synthetic-secret-never-persist/)
})

test('the default marker query binds to the inspected control database without persisting credentials',async()=>{
  const inspect=requiredFunction('inspectRehearsalService')
  const calls=[]
  let written
  await inspect({
    containerName:'metardu-release-rehearsal',
    output:path.resolve('.cache/release-verify/test/rehearsal-service.json'),
    executeDocker:args=>{
      calls.push(args)
      if(args[0]==='inspect')return JSON.stringify([container()])
      if(args[0]==='exec')return marker
      throw new Error(`Unexpected Docker invocation: ${args.join(' ')}`)
    },
    writeOutput:(output,identity)=>{written={output,identity}},
  })
  const markerCall=calls.find(args=>args[0]==='exec')
  assert.ok(markerCall)
  assert.equal(markerCall[1],containerId)
  assert.match(markerCall.at(-1),/-d "metardu_release_rehearsal"/)
  assert.doesNotMatch(markerCall.at(-1),/synthetic-secret-never-persist/)
  assert.doesNotMatch(JSON.stringify(written),/synthetic-secret-never-persist/)
})

test('the rehearsal identity CLI documents the reviewed container and output configuration',()=>{
  const usage=requiredFunction('rehearsalServiceCliUsage')()
  assert.match(usage,/--container/)
  assert.match(usage,/--output/)
  assert.match(usage,/METARDU_REHEARSAL_CONTAINER/)
  assert.match(usage,/METARDU_REHEARSAL_IDENTITY_FILE/)
  assert.match(usage,/rehearsal-service\.json/)
})

test('the unified release-contract inventory includes the rehearsal identity producer regression',()=>{
  assert.ok(releasePlan.UNIFIED_RELEASE_CONTRACT_TESTS.includes('tests/rehearsal-service-identity.test.mjs'))
})
