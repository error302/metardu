'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {createAuthenticatedRoomClient} from './authenticatedRoomClient'
import {roomPermissions,type RoomPeer,type ServerRoomMessage} from './collaborationProtocol'

export type Collaborator=RoomPeer
export type RoomChat=Extract<ServerRoomMessage,{type:'chat'}>
interface Props {
  projectId:string|null
  userId?:string
  onChat?:(message:RoomChat)=>void
  onRecordsChanged?:()=>void
}
const empty={collaborators:[] as Collaborator[],messages:[] as RoomChat[],isConnected:false,canChat:false,status:'Disconnected',warnings:[] as string[]}

/** One authorized JSON channel. No local/Yjs geometry is advertised as saved or shared. */
export function useCollaboration({projectId,userId,onChat,onRecordsChanged}:Props){
  const scope=`${projectId??''}:${userId??''}`
  const [state,setState]=useState({...empty,scope})
  const clientRef=useRef<ReturnType<typeof createAuthenticatedRoomClient>|null>(null)
  const callbacks=useRef({onChat,onRecordsChanged})
  useEffect(()=>{callbacks.current={onChat,onRecordsChanged}},[onChat,onRecordsChanged])
  useEffect(()=>{
    setState({...empty,scope})
    if(!projectId||!userId)return
    let active=true
    const seenMessages=new Set<string>()
    const client=createAuthenticatedRoomClient({projectId,userId,endpoint:process.env.NEXT_PUBLIC_WS_URL,
      onReady:message=>{if(active)setState(s=>({...s,isConnected:true,canChat:roomPermissions(message.role)?.canChat??false,status:message.role==='viewer'?'Connected · read-only':'Connected'}));if(active)callbacks.current.onRecordsChanged?.()},
      onPresence:collaborators=>{if(active)setState(s=>({...s,collaborators}))},
      onDisconnected:status=>{if(active)setState(s=>({...s,isConnected:false,canChat:false,collaborators:[],status}))},
      onChat:message=>{
        if(!active||seenMessages.has(message.id))return
        seenMessages.add(message.id)
        if(seenMessages.size>200){const oldest=seenMessages.values().next().value;if(oldest)seenMessages.delete(oldest)}
        setState(s=>s.messages.some(m=>m.id===message.id)?s:{...s,messages:[...s.messages.slice(-99),message]})
        callbacks.current.onChat?.(message)
      },
      onRecordsChanged:()=>{if(active)callbacks.current.onRecordsChanged?.()},
      onError:message=>{if(active)setState(s=>({...s,warnings:[...s.warnings.slice(-3),message]}))},
    })
    clientRef.current=client;void client.connect()
    return ()=>{active=false;client.disconnect();if(clientRef.current===client)clientRef.current=null}
  },[projectId,userId,scope])
  const sendChat=useCallback((message:string)=>clientRef.current?.sendChat(message)??false,[])
  const sendCursor=useCallback((lat:number,lng:number)=>clientRef.current?.sendCursor(lat,lng)??false,[])
  const notifyRecordsChanged=useCallback(()=>clientRef.current?.notifyRecordsChanged()??false,[])
  const visible=state.scope===scope?state:{...empty,scope}
  return {...visible,chatMessages:visible.messages,conflictWarnings:visible.warnings,sendChat,sendCursor,notifyRecordsChanged}
}
