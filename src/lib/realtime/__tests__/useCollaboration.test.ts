import {act,renderHook} from '@testing-library/react'
import {useCollaboration} from '../useCollaboration'
import {createAuthenticatedRoomClient} from '../authenticatedRoomClient'
jest.mock('../authenticatedRoomClient',()=>({createAuthenticatedRoomClient:jest.fn()}))
const factory=jest.mocked(createAuthenticatedRoomClient)
const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616',userId='5a278317-81db-4db9-b9b6-d5f8ca10ec38',otherId='27da351b-e7c2-4ff7-8379-bd6a680c244d'
const clients:Array<ReturnType<typeof createAuthenticatedRoomClient>>=[]
beforeEach(()=>{clients.length=0;factory.mockReset();factory.mockImplementation(()=>{
  const client={connect:jest.fn(async()=>{}),disconnect:jest.fn(),sendChat:jest.fn(()=>true),sendCursor:jest.fn(()=>true),notifyRecordsChanged:jest.fn(()=>true)}
  clients.push(client);return client
})})
const ready={type:'ready' as const,protocolVersion:1 as const,projectId,userId,role:'surveyor' as const,expiresAt:Date.now()+300000}
const chat={type:'chat' as const,id:otherId,projectId,userId:otherId,userName:'Office',message:'Saved source received',timestamp:Date.now()}
test('ready acknowledgements enable the room; only server echoes enter chat and reconnect refetches saved data',()=>{
  const onRecordsChanged=jest.fn(),onChat=jest.fn()
  const {result,unmount}=renderHook(()=>useCollaboration({projectId,userId,onRecordsChanged,onChat}))
  const callbacks=factory.mock.calls[0][0]
  expect(result.current.isConnected).toBe(false)
  act(()=>callbacks.onReady?.(ready));expect(result.current.isConnected).toBe(true)
  expect(onRecordsChanged).toHaveBeenCalledTimes(1)
  act(()=>{result.current.sendChat('outgoing')});expect(result.current.chatMessages).toEqual([])
  act(()=>{callbacks.onChat?.(chat);callbacks.onChat?.(chat)})
  expect(result.current.chatMessages).toEqual([chat]);expect(onChat).toHaveBeenCalledTimes(1)
  act(()=>callbacks.onDisconnected?.('Connection lost; reconnecting.'))
  expect(result.current.isConnected).toBe(false)
  act(()=>callbacks.onReady?.(ready));expect(onRecordsChanged).toHaveBeenCalledTimes(2)
  unmount();expect(clients[0].disconnect).toHaveBeenCalled()
})
test('account/project change clears messages and ignores late old-room callbacks',()=>{
  const onRecordsChanged=jest.fn()
  const {result,rerender,unmount}=renderHook(({id})=>useCollaboration({projectId:id,userId,onRecordsChanged}),{initialProps:{id:projectId}})
  const old=factory.mock.calls[0][0]
  act(()=>{old.onReady?.(ready);old.onChat?.(chat)})
  rerender({id:otherId});expect(result.current.chatMessages).toEqual([]);expect(result.current.isConnected).toBe(false)
  expect(clients[0].disconnect).toHaveBeenCalled()
  act(()=>{old.onReady?.(ready);old.onChat?.(chat);old.onRecordsChanged?.({type:'records_changed',projectId,userId,timestamp:Date.now()})})
  expect(result.current.chatMessages).toEqual([]);expect(onRecordsChanged).toHaveBeenCalledTimes(1)
  unmount()
})
test('latest review/refetch callback is used without disconnecting the room',()=>{
  const first=jest.fn(),second=jest.fn()
  const {rerender,unmount}=renderHook(({callback})=>useCollaboration({projectId,userId,onRecordsChanged:callback}),{initialProps:{callback:first}})
  rerender({callback:second});expect(factory).toHaveBeenCalledTimes(1)
  act(()=>factory.mock.calls[0][0].onRecordsChanged?.({type:'records_changed',projectId,userId,timestamp:Date.now()}))
  expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledTimes(1);unmount()
})
