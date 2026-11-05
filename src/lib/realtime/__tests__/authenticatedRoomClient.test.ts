import {createAuthenticatedRoomClient, type RoomSocket} from '../authenticatedRoomClient'

const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616'
const userId='5a278317-81db-4db9-b9b6-d5f8ca10ec38'
const otherId='27da351b-e7c2-4ff7-8379-bd6a680c244d'
class Socket implements RoomSocket {
  readyState=0
  onopen: RoomSocket['onopen']=null
  onmessage: RoomSocket['onmessage']=null
  onclose: RoomSocket['onclose']=null
  onerror: RoomSocket['onerror']=null
  send=jest.fn()
  close=jest.fn(()=>{this.readyState=3})
  open(){this.readyState=1;this.onopen?.()}
  receive(value:unknown){this.onmessage?.({data:JSON.stringify(value)})}
  gone(code=1006){this.readyState=3;this.onclose?.({code})}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
function setup(role:'surveyor'|'viewer'='surveyor'){
  const expiresAt=Date.now()+300000
  const grant={ticket:'synthetic.signed',projectId,userId,role,protocolVersion:1,expiresAt}
  const requestTicket=jest.fn(async(_project:string,_signal:AbortSignal):Promise<unknown>=>grant)
  const sockets:Socket[]=[]
  const createSocket=jest.fn(()=>{const s=new Socket();sockets.push(s);return s})
  const onReady=jest.fn(),onPresence=jest.fn(),onChat=jest.fn(),onRecordsChanged=jest.fn(),onDisconnected=jest.fn()
  const client=createAuthenticatedRoomClient({projectId,userId,endpoint:'ws://127.0.0.1:3001/ws/collaboration',pageUrl:'http://127.0.0.1:3021',requestTicket,createSocket,onReady,onPresence,onChat,onRecordsChanged,onDisconnected})
  const ready=()=>{const socket=sockets.at(-1);if(!socket)throw new Error('No test socket');socket.receive({type:'ready',protocolVersion:1,projectId,userId,role,expiresAt})}
  return {client,grant,requestTicket,createSocket,sockets,ready,onReady,onPresence,onChat,onRecordsChanged,onDisconnected}
}
beforeEach(()=>jest.useFakeTimers())
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers()})
test('socket open is not authenticated ready; credentials are absent from the URL',async()=>{
  const s=setup();await s.client.connect();s.sockets[0].open()
  expect(s.onReady).not.toHaveBeenCalled();expect(s.client.sendChat('hi')).toBe(false)
  const [url,protocols]=s.createSocket.mock.calls[0] as unknown as [string,string[]]
  expect(url).not.toContain('synthetic.signed');expect(new URL(url).searchParams.get('projectId')).toBe(projectId)
  expect(protocols).toEqual(['metardu-room-v1','ticket.synthetic.signed'])
  s.ready();expect(s.onReady).toHaveBeenCalledTimes(1)
  expect(s.client.sendChat(' hello ')).toBe(true)
  expect(s.sockets[0].send).toHaveBeenLastCalledWith(JSON.stringify({type:'chat',message:'hello'}))
  s.client.disconnect()
})
test.each([{userId:otherId},{projectId:otherId},{role:'owner'},{protocolVersion:2},{expiresAt:0}])('rejects server acknowledgement mismatch %p',async change=>{
  const s=setup();await s.client.connect();s.sockets[0].open()
  s.sockets[0].receive({type:'ready',...s.grant,ticket:undefined,...change})
  expect(s.onReady).not.toHaveBeenCalled();expect(s.sockets[0].close).toHaveBeenCalled()
  s.client.disconnect()
})
test('receives authenticated chat and invalidations but rejects cross-room messages',async()=>{
  const s=setup();await s.client.connect();s.sockets[0].open();s.ready()
  const message={type:'chat',id:otherId,projectId,userId:otherId,userName:'Office',message:'Review saved R1',timestamp:Date.now()}
  s.sockets[0].receive(message);expect(s.onChat).toHaveBeenCalledWith(message)
  s.sockets[0].receive({type:'records_changed',projectId,userId:otherId,timestamp:Date.now()})
  expect(s.onRecordsChanged).toHaveBeenCalledTimes(1)
  s.sockets[0].receive({...message,projectId:otherId})
  expect(s.onChat).toHaveBeenCalledTimes(1);expect(s.sockets[0].close).toHaveBeenCalled()
  s.client.disconnect()
})
test('read-only viewer cannot send chat, cursor or saved-data invalidations',async()=>{
  const s=setup('viewer');await s.client.connect();s.sockets[0].open();s.ready()
  expect(s.client.sendChat('write')).toBe(false)
  expect(s.client.sendCursor(0,0)).toBe(false)
  expect(s.client.notifyRecordsChanged()).toBe(false)
  expect(s.sockets[0].send).not.toHaveBeenCalled();s.client.disconnect()
})
test('reconnect requests a new ticket and ignores old socket callbacks',async()=>{
  const s=setup();await s.client.connect();s.sockets[0].open();s.ready()
  const old=s.sockets[0];old.gone();jest.advanceTimersByTime(1000);await flush()
  expect(s.requestTicket).toHaveBeenCalledTimes(2);expect(s.sockets).toHaveLength(2)
  old.receive({type:'records_changed',projectId,userId:otherId,timestamp:Date.now()})
  expect(s.onRecordsChanged).not.toHaveBeenCalled()
  s.sockets[1].open();s.ready();expect(s.onReady).toHaveBeenCalledTimes(2);s.client.disconnect()
})
test('disconnect during ticket request aborts and never opens a stale socket',async()=>{
  const s=setup();let resolve!:(value:unknown)=>void
  s.requestTicket.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
  const pending=s.client.connect();s.client.disconnect();resolve(s.grant);await pending
  expect(s.createSocket).not.toHaveBeenCalled();jest.advanceTimersByTime(600000)
  expect(s.requestTicket).toHaveBeenCalledTimes(1)
})
test('handshake timeout and missed heartbeat clear ready state and reconnect',async()=>{
  const s=setup();await s.client.connect();s.sockets[0].open()
  jest.advanceTimersByTime(10000);expect(s.sockets[0].close).toHaveBeenCalled()
  jest.advanceTimersByTime(1000);await flush();s.sockets[1].open();s.ready()
  jest.advanceTimersByTime(60000);expect(s.onDisconnected).toHaveBeenLastCalledWith('Connection lost; reconnecting.')
  expect(s.client.sendChat('stale')).toBe(false);s.client.disconnect()
})
test('unavailable or mixed-content endpoint never creates a grant or a fake connection',async()=>{
  const requestTicket=jest.fn(),onDisconnected=jest.fn()
  const client=createAuthenticatedRoomClient({projectId,userId,endpoint:'ws://localhost:3001/ws/collaboration',pageUrl:'https://metardu.space',requestTicket,onDisconnected})
  await client.connect();expect(requestTicket).not.toHaveBeenCalled()
  expect(onDisconnected).toHaveBeenCalledWith('Secure collaboration is unavailable on this deployment.')
  client.disconnect()
})
test('production tickets cannot be sent to another WebSocket origin',async()=>{
  const requestTicket=jest.fn(),onDisconnected=jest.fn()
  const client=createAuthenticatedRoomClient({projectId,userId,endpoint:'wss://unrelated.invalid/ws/collaboration',pageUrl:'https://metardu.space',requestTicket,onDisconnected})
  await client.connect();expect(requestTicket).not.toHaveBeenCalled()
  expect(onDisconnected).toHaveBeenCalledWith('Secure collaboration is unavailable on this deployment.');client.disconnect()
})
test('a stalled ticket request times out and can retry; it cannot remain Connecting forever',async()=>{
  const s=setup()
  s.requestTicket.mockImplementationOnce((_project,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))))
  const pending=s.client.connect();jest.advanceTimersByTime(10000);await pending
  expect(s.onDisconnected).toHaveBeenLastCalledWith('Collaboration unavailable; retrying.')
  jest.advanceTimersByTime(1000);await flush();expect(s.requestTicket).toHaveBeenCalledTimes(2);s.client.disconnect()
})
test('expiry refreshes authentication instead of retaining an old role indefinitely',async()=>{
  const s=setup();await s.client.connect();s.sockets[0].open();s.ready()
  for(let n=0;n<15;n++){jest.advanceTimersByTime(19000);s.sockets[0].receive({type:'pong',projectId,timestamp:Date.now()})}
  jest.advanceTimersByTime(15000);expect(s.client.sendChat('expired')).toBe(false)
  jest.advanceTimersByTime(1000);await flush();expect(s.requestTicket).toHaveBeenCalledTimes(2);s.client.disconnect()
})
