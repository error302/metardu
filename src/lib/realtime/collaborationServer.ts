/** Authenticated transient project rooms. Survey edits and review records belong to durable authorized APIs. */
import {WebSocketServer,WebSocket} from 'ws'
import {createServer,type Server,type IncomingMessage} from 'node:http'
import {randomUUID} from 'node:crypto'
import {verifyRoomTicket,type RoomTicketIdentity} from './roomTicket'
import {ROOM_PROTOCOL_VERSION,clientRoomMessageSchema,roomPermissions,type ServerRoomMessage} from './collaborationProtocol'

// Keep the historical import surface while the HTTP issuer imports the small ticket module directly.
export {signRoomTicket,verifyRoomTicket} from './roomTicket'
interface Peer extends RoomTicketIdentity {
  id:string;projectId:string;userName:string;color:string;ws:WebSocket
  cursor?:{lat:number;lng:number};lastSeen:number;windowStart:number;count:number
  expiry:ReturnType<typeof setTimeout>
}
interface Options {secret?:string;allowedOrigins?:string[]}
export class CollaborationServer {
  private server:Server|null=null
  private wss:WebSocketServer|null=null
  private heartbeat:ReturnType<typeof setInterval>|undefined
  private peers=new Map<string,Peer>()
  private rooms=new Map<string,Set<string>>()
  private colors=['#D17B47','#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899']
  constructor(private options:Options={}){}

  private authenticate(req:IncomingMessage):(RoomTicketIdentity&{projectId:string})|null {
    try{
      const url=new URL(req.url??'','http://room.invalid')
      if(url.pathname!=='/ws/collaboration'||url.searchParams.has('ticket')||url.searchParams.getAll('projectId').length!==1)return null
      const allowed=this.options.allowedOrigins??(process.env.COLLAB_ALLOWED_ORIGINS??process.env.NEXTAUTH_URL??process.env.NEXT_PUBLIC_APP_URL??'').split(',').map(s=>s.trim()).filter(Boolean)
      if(typeof req.headers.origin!=='string'||!allowed.includes(req.headers.origin))return null
      const protocols=req.headers['sec-websocket-protocol']?.split(',').map(s=>s.trim())??[]
      if(protocols.length!==2||protocols[0]!=='metardu-room-v1'||!protocols[1].startsWith('ticket.'))return null
      const projectId=url.searchParams.get('projectId')??''
      const identity=verifyRoomTicket(this.options.secret??process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET??'',protocols[1].slice(7),projectId)
      return identity?{...identity,projectId}:null
    }catch{return null}
  }

  async start(port=3001,host='0.0.0.0'):Promise<number>{
    if(this.server)throw new Error('Collaboration server is already running.')
    const server=createServer((req,res)=>{
      if(req.url==='/health'){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
        res.end(JSON.stringify({status:'healthy',protocolVersion:ROOM_PROTOCOL_VERSION,collaborators:this.peers.size,projects:this.rooms.size,uptime:process.uptime()}));return
      }
      res.writeHead(404);res.end('Not Found')
    })
    this.server=server
    const wss=new WebSocketServer({server,path:'/ws/collaboration',maxPayload:16384,perMessageDeflate:false,
      handleProtocols:protocols=>protocols.has('metardu-room-v1')?'metardu-room-v1':false})
    this.wss=wss
    wss.on('connection',(ws,req)=>{
      const identity=this.authenticate(req)
      if(!identity){ws.close(1008,'Project room access denied');return}
      const room=this.rooms.get(identity.projectId)??new Set<string>()
      if(room.size>=200||this.peers.size>=2000){ws.close(1013,'Room capacity reached');return}
      const id=randomUUID(),now=Date.now()
      const peer:Peer={...identity,id,ws,userName:identity.userName??'Surveyor',color:this.colors[this.peers.size%this.colors.length],
        lastSeen:now,windowStart:now,count:0,expiry:setTimeout(()=>ws.close(4001,'Room ticket expired'),identity.expiresAt-now)}
      this.peers.set(id,peer);room.add(id);this.rooms.set(identity.projectId,room)
      this.send(peer,{type:'ready',protocolVersion:ROOM_PROTOCOL_VERSION,userId:identity.userId,projectId:identity.projectId,role:identity.role,expiresAt:identity.expiresAt})
      this.presence(identity.projectId)
      ws.on('message',(bytes,binary)=>{
        if(Date.now()>=peer.expiresAt){ws.close(4001,'Room ticket expired');return}
        if(Date.now()-peer.windowStart>=1000){peer.windowStart=Date.now();peer.count=0}
        if(++peer.count>30){
          if(peer.count===31)this.send(peer,{type:'error',code:'RATE_LIMITED',message:'Too many room messages; please slow down.'})
          if(peer.count>60)ws.close(1008,'Room message limit exceeded')
          return
        }
        let input:unknown
        try{if(binary)throw new Error('Binary messages unsupported');input=JSON.parse(bytes.toString())}catch{
          this.send(peer,{type:'error',code:'INVALID_MESSAGE',message:'Invalid room message.'});return
        }
        const parsed=clientRoomMessageSchema.safeParse(input)
        if(!parsed.success){this.send(peer,{type:'error',code:'INVALID_MESSAGE',message:'Invalid room message.'});return}
        peer.lastSeen=Date.now()
        const message=parsed.data,projectId=peer.projectId,timestamp=Date.now()
        if(message.type==='ping'){this.send(peer,{type:'pong',projectId,timestamp});return}
        const permissions=roomPermissions(peer.role)
        const allowed=message.type==='chat'?permissions?.canChat:message.type==='cursor'?permissions?.canShareCursor:permissions?.canNotifyChange
        if(!allowed){this.send(peer,{type:'error',code:'READ_ONLY',message:'This project role has read-only room access.'});return}
        if(message.type==='chat')this.broadcast(projectId,{type:'chat',id:randomUUID(),projectId,userId:peer.userId,userName:peer.userName,message:message.message,timestamp})
        if(message.type==='records_changed')this.broadcast(projectId,{type:'records_changed',projectId,userId:peer.userId,timestamp})
        if(message.type==='cursor'){peer.cursor=message.cursor;this.presence(projectId)}
      })
      ws.on('close',()=>this.remove(peer))
      // Socket errors must not crash the room service or log request headers/tickets.
      ws.on('error',()=>{ws.terminate();this.remove(peer)})
    })
    this.heartbeat=setInterval(()=>{
      for(const peer of this.peers.values())if(Date.now()-peer.lastSeen>60000||Date.now()>=peer.expiresAt){peer.ws.terminate();this.remove(peer)}
    },15000)
    this.heartbeat.unref()
    try{
      await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve()})})
      const address=server.address();if(!address||typeof address==='string')throw new Error('Room listener address unavailable.')
      return address.port
    }catch(error){await this.stop();throw error}
  }
  private send(peer:Peer,message:ServerRoomMessage){
    if(peer.ws.readyState!==WebSocket.OPEN)return
    if(peer.ws.bufferedAmount>262144){peer.ws.close(1013,'Room client is too slow');return}
    peer.ws.send(JSON.stringify(message))
  }
  private broadcast(projectId:string,message:ServerRoomMessage){
    for(const id of this.rooms.get(projectId)??[]){const peer=this.peers.get(id);if(peer)this.send(peer,message)}
  }
  private presence(projectId:string){
    const byUser=new Map<string,{userId:string;userName:string;color:string;cursor?:{lat:number;lng:number}}>()
    for(const id of this.rooms.get(projectId)??[]){const peer=this.peers.get(id);if(peer)byUser.set(peer.userId,{userId:peer.userId,userName:peer.userName,color:peer.color,...(peer.cursor?{cursor:peer.cursor}:{})})}
    this.broadcast(projectId,{type:'presence',projectId,payload:[...byUser.values()]})
  }
  private remove(peer:Peer){
    if(!this.peers.delete(peer.id))return
    clearTimeout(peer.expiry)
    const room=this.rooms.get(peer.projectId);room?.delete(peer.id)
    if(!room?.size)this.rooms.delete(peer.projectId)
    else this.presence(peer.projectId)
  }
  async stop():Promise<void>{
    clearInterval(this.heartbeat)
    for(const peer of this.peers.values()){clearTimeout(peer.expiry);peer.ws.terminate()}
    this.peers.clear();this.rooms.clear()
    const wss=this.wss,server=this.server;this.wss=null;this.server=null
    if(wss)await new Promise<void>(resolve=>wss.close(()=>resolve()))
    if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()))
  }
}
let serverInstance:CollaborationServer|null=null
export function getCollaborationServer(){return serverInstance??=new CollaborationServer()}
