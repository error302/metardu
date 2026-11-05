import {z} from 'zod'
import {ROOM_PROTOCOL_VERSION,roomRoleSchema,roomPermissions,clientRoomMessageSchema,serverRoomMessageSchema,type ServerRoomMessage,type RoomPeer} from './collaborationProtocol'

export interface RoomSocket {
  readyState:number
  send(data:string):void
  close(code?:number,reason?:string):void
  onopen:(()=>void)|null
  onmessage:((event:{data:unknown})=>void)|null
  onclose:((event:{code:number})=>void)|null
  onerror:(()=>void)|null
}
type Ready=Extract<ServerRoomMessage,{type:'ready'}>
type Chat=Extract<ServerRoomMessage,{type:'chat'}>
const grantSchema=z.object({ticket:z.string().min(1).max(4096),projectId:z.string().guid(),userId:z.string().guid(),
  role:roomRoleSchema,protocolVersion:z.literal(ROOM_PROTOCOL_VERSION),expiresAt:z.number().int().positive()}).strict()
interface Options {
  projectId:string
  userId:string
  endpoint?:string
  pageUrl?:string
  requestTicket?:(projectId:string,signal:AbortSignal)=>Promise<unknown>
  createSocket?:(url:string,protocols:string[])=>RoomSocket
  onReady?:(message:Ready)=>void
  onPresence?:(peers:RoomPeer[])=>void
  onChat?:(message:Chat)=>void
  onRecordsChanged?:(message:Extract<ServerRoomMessage,{type:'records_changed'}>)=>void
  onDisconnected?:(reason:string)=>void
  onError?:(message:string)=>void
}

/** The browser cannot choose identity or permissions. A fresh HTTP grant and WS acknowledgement must agree. */
export function createAuthenticatedRoomClient(options:Options){
  let generation=0,stopped=true,retries=0,socket:RoomSocket|null=null,ready:Ready|null=null
  let controller:AbortController|null=null
  let retryTimer:ReturnType<typeof setTimeout>|undefined,handshakeTimer:ReturnType<typeof setTimeout>|undefined
  let expiryTimer:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined
  let connecting:Promise<void>|null=null,lastReceived=0
  const requestTicket=options.requestTicket??(async(projectId:string,signal:AbortSignal)=>{
    const response=await fetch('/api/realtime/ticket',{method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId})})
    if(!response.ok)throw new Error(response.status===401||response.status===403?'ACCESS_DENIED':'UNAVAILABLE')
    const result:unknown=await response.json();return result
  })
  const createSocket:(url:string,protocols:string[])=>RoomSocket=options.createSocket??((url,protocols)=>{
    const native=new WebSocket(url,protocols)
    const adapter:RoomSocket={get readyState(){return native.readyState},send:data=>native.send(data),close:(code,reason)=>native.close(code,reason),
      onopen:null,onmessage:null,onclose:null,onerror:null}
    native.onopen=()=>adapter.onopen?.()
    native.onmessage=event=>adapter.onmessage?.({data:event.data as unknown})
    native.onclose=event=>adapter.onclose?.({code:event.code})
    native.onerror=()=>adapter.onerror?.()
    return adapter
  })
  function clearConnectionTimers(){clearTimeout(handshakeTimer);clearTimeout(expiryTimer);clearInterval(heartbeat)}
  function closeSocket(){const previous=socket;socket=null;ready=null;clearConnectionTimers();previous?.close(1000,'Room disconnected')}
  function retry(){
    if(stopped)return
    clearTimeout(retryTimer)
    retryTimer=setTimeout(()=>{void attempt()},Math.min(30000,1000*2**Math.min(retries++,5)))
  }
  function disconnected(reason:string,reconnect:boolean){
    generation++;controller?.abort();closeSocket();options.onPresence?.([]);options.onDisconnected?.(reason)
    if(reconnect)retry()
  }
  function endpoint(){
    try{
      const page=new URL(options.pageUrl??window.location.href)
      if(!options.endpoint)return null
      const url=new URL(options.endpoint,page)
      const local=['localhost','127.0.0.1','[::1]']
      if(url.username||url.password||url.hash||url.search||url.pathname!=='/ws/collaboration')return null
      if(url.protocol!=='wss:'&&!(url.protocol==='ws:'&&page.protocol==='http:'&&local.includes(page.hostname)&&local.includes(url.hostname)))return null
      if(local.includes(url.hostname)&&!local.includes(page.hostname))return null
      if(page.protocol==='https:'&&url.host!==page.host)return null
      url.searchParams.set('projectId',options.projectId)
      return url.toString()
    }catch{return null}
  }
  async function attempt(){
    if(stopped)return
    const url=endpoint()
    if(!url){disconnected('Secure collaboration is unavailable on this deployment.',false);return}
    const current=++generation
    controller?.abort();controller=new AbortController();closeSocket()
    options.onPresence?.([]);options.onDisconnected?.('Connecting to project room…')
    try{
      const grantController=controller
      const grantTimeout=setTimeout(()=>grantController.abort(),10000)
      let input:unknown
      try{input=await requestTicket(options.projectId,grantController.signal)}finally{clearTimeout(grantTimeout)}
      const grant=grantSchema.parse(input)
      if(stopped||generation!==current)return
      if(grant.projectId!==options.projectId||grant.userId!==options.userId||grant.expiresAt<=Date.now()||grant.expiresAt>Date.now()+300000)throw new Error('ACCESS_DENIED')
      const ws=createSocket(url,['metardu-room-v1',`ticket.${grant.ticket}`]);socket=ws
      const active=()=>!stopped&&generation===current&&socket===ws
      const lost=()=>{if(active())disconnected('Connection lost; reconnecting.',true)}
      handshakeTimer=setTimeout(lost,10000)
      ws.onopen=()=>{ /* Only the server's authenticated ready frame establishes a connection. */ }
      ws.onclose=event=>{if(active())disconnected(event.code===1008?'Project room access was denied.':'Connection lost; reconnecting.',event.code!==1008)}
      ws.onerror=lost
      ws.onmessage=event=>{
        if(!active())return
        if(typeof event.data!=='string'||event.data.length>32768){disconnected('Invalid project room response.',false);return}
        let input:unknown
        try{input=JSON.parse(event.data)}catch{disconnected('Invalid project room response.',false);return}
        const parsed=serverRoomMessageSchema.safeParse(input)
        if(!parsed.success){disconnected('Invalid project room response.',false);return}
        const message=parsed.data
        if('projectId' in message&&message.projectId!==options.projectId){disconnected('Project room identity mismatch.',false);return}
        if(message.type==='ready'){
          if(ws.readyState!==1||ready||message.userId!==grant.userId||message.role!==grant.role||message.expiresAt!==grant.expiresAt||message.expiresAt<=Date.now()){
            disconnected('Project room identity mismatch.',false);return
          }
          ready=message;lastReceived=Date.now();retries=0;clearTimeout(handshakeTimer)
          expiryTimer=setTimeout(()=>{if(active())disconnected('Room authentication expired; reconnecting.',true)},message.expiresAt-Date.now())
          heartbeat=setInterval(()=>{
            if(!active())return
            if(Date.now()-lastReceived>=45000){lost();return}
            try{ws.send(JSON.stringify({type:'ping'}))}catch{lost()}
          },20000)
          options.onReady?.(message);return
        }
        if(!ready)return
        lastReceived=Date.now()
        if(message.type==='presence')options.onPresence?.(message.payload.filter(peer=>peer.userId!==options.userId))
        if(message.type==='chat')options.onChat?.(message)
        if(message.type==='records_changed')options.onRecordsChanged?.(message)
        if(message.type==='error')options.onError?.(message.message)
      }
    }catch(error){
      if(stopped||generation!==current)return
      const denied=error instanceof Error&&error.message==='ACCESS_DENIED'
      disconnected(denied?'Project room access was denied.':'Collaboration unavailable; retrying.',!denied)
    }
  }
  function send(input:unknown,permission:'canChat'|'canNotifyChange'|'canShareCursor'){
    if(!ready||!socket||socket.readyState!==1||ready.expiresAt<=Date.now()||!roomPermissions(ready.role)?.[permission])return false
    const message=clientRoomMessageSchema.safeParse(input)
    if(!message.success)return false
    try{socket.send(JSON.stringify(message.data));return true}catch{disconnected('Connection lost; reconnecting.',true);return false}
  }
  return {
    connect(){if(connecting)return connecting;stopped=false;clearTimeout(retryTimer);connecting=attempt().finally(()=>{connecting=null});return connecting},
    disconnect(){stopped=true;generation++;clearTimeout(retryTimer);controller?.abort();closeSocket();options.onPresence?.([]);options.onDisconnected?.('Disconnected')},
    sendChat:(message:string)=>send({type:'chat',message},'canChat'),
    sendCursor:(lat:number,lng:number)=>send({type:'cursor',cursor:{lat,lng}},'canShareCursor'),
    notifyRecordsChanged:()=>send({type:'records_changed'},'canNotifyChange'),
  }
}
