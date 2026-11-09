import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import test from 'node:test'
import { parse } from 'node:url'
import { WebSocketServer } from 'ws'
import { assertHealthProbeOnlyChange, collaborationConfiguration, checkRoomRoute } from '../scripts/collaboration-release.mjs'
import { proxyRequest } from 'next/dist/server/lib/router-utils/proxy-request.js'

const origin='https://metardu.space'
const require=createRequire(import.meta.url)

test('rollout accepts only the production origin and matching existing signing configuration',()=>{
  const app={NEXT_PUBLIC_APP_URL:origin,AUTH_SECRET:'synthetic'}
  const current={AUTH_SECRET:'synthetic',PORT:'3001'}
  const compose={...current,COLLAB_ALLOWED_ORIGINS:origin}
  assert.deepEqual(collaborationConfiguration(app,current,compose),{origin,protocolVersion:1})
  for(const unsafe of [{...compose,COLLAB_ALLOWED_ORIGINS:'*'},{...compose,PORT:'3002'},{...compose,AUTH_SECRET:'mismatch'}]){
    assert.throws(()=>collaborationConfiguration(app,current,unsafe))
  }
  assert.throws(()=>collaborationConfiguration({...app,AUTH_SECRET:'mismatch'},current,compose))
})

function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject)
    server.listen(0,'127.0.0.1',()=>resolve(server.address().port))
  })
}
function close(server){return new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}

test('Next WebSocket proxy preserves origin, project query, and credential subprotocol',async()=>{
  const previous=process.env.NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN
  let rules
  try {
    process.env.NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN='1'
    rules=(await require('../next.config.js').rewrites()).beforeFiles
  } finally {
    if(previous===undefined)delete process.env.NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN
    else process.env.NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN=previous
  }
  assert.deepEqual(rules,[{source:'/ws/collaboration',has:[{type:'header',key:'upgrade',value:'websocket'}],destination:'http://metardu-collaboration:3001/ws/collaboration'}])

  const backend=createServer()
  const room=new WebSocketServer({server:backend,path:rules[0].source})
  let received
  room.on('connection',(socket,request)=>{
    received={origin:request.headers.origin,protocols:request.headers['sec-websocket-protocol'],query:parse(request.url,true).query}
    socket.close(1008)
  })
  const backendPort=await listen(backend)
  const front=createServer((req,res)=>{res.writeHead(404);res.end()})
  front.on('upgrade',(req,socket,head)=>{
    const path=parse(req.url,true)
    if(path.pathname!==rules[0].source||req.headers.upgrade!==rules[0].has[0].value){socket.destroy();return}
    const target=parse('http://127.0.0.1:'+backendPort+path.pathname,true)
    target.query=path.query
    void proxyRequest(req,socket,target,head).catch(()=>socket.destroy())
  })
  const frontPort=await listen(front)
  try{
    const result=await checkRoomRoute('ws://127.0.0.1:'+frontPort,origin)
    assert.deepEqual(result,{protocolVersion:1,invalidTicketDenied:true})
    assert.equal(received.origin,origin)
    assert.equal(received.protocols,'metardu-room-v1,ticket.invalid')
    assert.match(received.query.projectId,/^[a-f0-9-]{36}$/)
    assert.deepEqual(Object.keys(received.query),['projectId'])
  }finally{
    room.close()
    await close(front)
    await close(backend)
  }
})


test('a built candidate may resume only with the exact IPv4 health probe correction',()=>{
  const before='healthcheck:\n  test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]\n'
  const after=before.replace('localhost','127.0.0.1')
  assertHealthProbeOnlyChange(before,after)
  for(const unsafe of [before,after+'extra: true\n',after.replace('3001','3010')]){
    assert.throws(()=>assertHealthProbeOnlyChange(before,unsafe))
  }
})
