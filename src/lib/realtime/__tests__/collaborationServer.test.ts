/** @jest-environment node */
import {WebSocket} from 'ws'
import {createHmac} from 'node:crypto'
import {CollaborationServer} from '../collaborationServer'
import {signRoomTicket} from '../roomTicket'
import {serverRoomMessageSchema,type ServerRoomMessage} from '../collaborationProtocol'

const secret='synthetic-room-service-test-secret'
const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616',otherProject='83fe20d5-e505-4408-8fe8-804a873bced2'
const crewId='5a278317-81db-4db9-b9b6-d5f8ca10ec38',officeId='27da351b-e7c2-4ff7-8379-bd6a680c244d'
const origin='http://127.0.0.1:3021'
let service:CollaborationServer,port:number
const sockets:WebSocket[]=[]
async function peer(id:string,role:'surveyor'|'viewer'|'project_manager'='surveyor',room=projectId,ticket?:string,from=origin){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws/collaboration?projectId=${room}`,
    ['metardu-room-v1',`ticket.${ticket??signRoomTicket(secret,id,room,id===crewId?'Crew':'Office',role)}`],{origin:from})
  sockets.push(ws)
  const messages:ServerRoomMessage[]=[]
  ws.on('message',bytes=>{messages.push(serverRoomMessageSchema.parse(JSON.parse(bytes.toString())))})
  const wait=async(type:ServerRoomMessage['type'],after=0)=>{
    for(let n=0;n<100;n++){const found=messages.slice(after).find(m=>m.type===type);if(found)return found;await new Promise(r=>setTimeout(r,5))}
    throw new Error(`No ${type} frame`)
  }
  const closed=new Promise<number>(resolve=>ws.once('close',code=>resolve(code)))
  return {ws,messages,wait,closed}
}
beforeEach(async()=>{service=new CollaborationServer({secret,allowedOrigins:[origin]});port=await service.start(0,'127.0.0.1')})
afterEach(async()=>{sockets.splice(0).forEach(s=>s.terminate());await service.stop()})
test('two real sockets receive server-attributed chat and saved-record invalidation, with room isolation',async()=>{
  const crew=await peer(crewId),office=await peer(officeId,'project_manager'),other=await peer(officeId,'surveyor',otherProject)
  await Promise.all([crew.wait('ready'),office.wait('ready'),other.wait('ready')])
  crew.ws.send(JSON.stringify({type:'chat',message:'R1 is saved; please review.'}))
  const chat=await office.wait('chat');expect(chat).toMatchObject({projectId,userId:crewId,userName:'Crew',message:'R1 is saved; please review.'})
  expect(await crew.wait('chat')).toEqual(chat)
  crew.ws.send(JSON.stringify({type:'records_changed'}));expect(await office.wait('records_changed')).toMatchObject({projectId,userId:crewId})
  expect(other.messages.some(m=>m.type==='chat'||m.type==='records_changed')).toBe(false)
  crew.ws.send(JSON.stringify({type:'ping'}));expect(await crew.wait('pong')).toMatchObject({projectId})
})
test('viewer can receive presence but cannot chat, move cursors or claim saved changes',async()=>{
  const viewer=await peer(crewId,'viewer'),office=await peer(officeId)
  await Promise.all([viewer.wait('ready'),office.wait('ready')]);await viewer.wait('presence')
  for(const payload of [{type:'chat',message:'forbidden'},{type:'cursor',cursor:{lat:0,lng:0}},{type:'records_changed'}]){
    const after=viewer.messages.length;viewer.ws.send(JSON.stringify(payload));expect(await viewer.wait('error',after)).toMatchObject({code:'READ_ONLY'})
  }
  expect(office.messages.some(m=>m.type==='chat'||m.type==='records_changed')).toBe(false)
})
test('spoofed sender and geometry writes are rejected rather than relayed',async()=>{
  const crew=await peer(crewId),office=await peer(officeId);await Promise.all([crew.wait('ready'),office.wait('ready')])
  for(const payload of [{type:'chat',message:'spoof',userId:officeId},{type:'feature_delete',featureId:'p'},{type:'cursor',cursor:{lat:NaN,lng:0}}]){
    const after=crew.messages.length;crew.ws.send(JSON.stringify(payload));expect(await crew.wait('error',after)).toMatchObject({code:'INVALID_MESSAGE'})
  }
  expect(office.messages.some(m=>m.type==='chat')).toBe(false)
})
test('wrong project, untrusted browser origin and legacy query-string authentication fail closed',async()=>{
  const ticket=signRoomTicket(secret,crewId,projectId,'Crew','surveyor')
  const wrong=await peer(crewId,'surveyor',otherProject,ticket)
  expect(await wrong.closed).toBe(1008);expect(wrong.messages).toEqual([])
  const alien=await peer(crewId,'surveyor',projectId,ticket,'https://unrelated.invalid')
  expect(await alien.closed).toBe(1008)
  const old=new WebSocket(`ws://127.0.0.1:${port}/ws/collaboration?projectId=${projectId}&ticket=${ticket}`,{origin})
  sockets.push(old);expect(await new Promise<number>(r=>old.once('close',r))).toBe(1008)
})
test('ticket expiration closes a live socket and cannot be extended by pings',async()=>{
  const payload=Buffer.from(JSON.stringify({protocolVersion:1,userId:crewId,projectId,userName:'Crew',role:'surveyor',exp:Date.now()+180})).toString('base64url')
  const ticket=`${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`
  const crew=await peer(crewId,'surveyor',projectId,ticket);await crew.wait('ready')
  crew.ws.send(JSON.stringify({type:'ping'}));expect(await crew.closed).toBe(4001)
})
test('presence changes reach existing peers and empty rooms disappear on close',async()=>{
  const crew=await peer(crewId);await crew.wait('ready')
  const after=crew.messages.length,office=await peer(officeId);await office.wait('ready')
  const joined=await crew.wait('presence',after)
  expect(joined.type).toBe('presence')
  if(joined.type==='presence')expect(joined.payload.some(peer=>peer.userId===officeId)).toBe(true)
  const before=crew.messages.length;office.ws.close();await office.closed
  const presence=await crew.wait('presence',before)
  if(presence.type==='presence')expect(presence.payload).toHaveLength(1)
  crew.ws.close();await crew.closed
  const response=await fetch(`http://127.0.0.1:${port}/health`)
  expect(await response.json()).toMatchObject({collaborators:0,projects:0,protocolVersion:1})
})
