import { clientRoomMessageSchema, roomPermissions, serverRoomMessageSchema } from '../collaborationProtocol'

const userId='5a278317-81db-4db9-b9b6-d5f8ca10ec38'
const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616'

describe('authenticated collaboration wire contract',()=>{
  test.each(['owner','super_admin','org_admin','project_manager','surveyor'])('recognizes editing role %s',role=>{
    expect(roomPermissions(role)).toEqual({canChat:true,canNotifyChange:true,canShareCursor:true})
  })
  test('viewers cannot write even transient room content',()=>{
    expect(roomPermissions('viewer')).toEqual({canChat:false,canNotifyChange:false,canShareCursor:false})
  })
  test.each([null,undefined,'admin','made-up-admin','',{},1])('unknown role fails closed: %p',role=>{
    expect(roomPermissions(role)).toBeNull()
  })
  test('a chat cannot spoof the authenticated sender',()=>{
    expect(clientRoomMessageSchema.safeParse({type:'chat',message:'Review point G12',userId}).success).toBe(false)
    expect(clientRoomMessageSchema.parse({type:'chat',message:' Review point G12 '})).toEqual({type:'chat',message:'Review point G12'})
  })
  test('rejects blank/oversized chat and survey geometry replacement',()=>{
    expect(clientRoomMessageSchema.safeParse({type:'chat',message:'  '}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'chat',message:'x'.repeat(2001)}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'feature_edit',feature:{id:'point',x:1,y:2,z:3}}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'feature_delete',featureId:'point'}).success).toBe(false)
  })
  test('cursor coordinates must be finite WGS84 display coordinates',()=>{
    expect(clientRoomMessageSchema.safeParse({type:'cursor',cursor:{lat:NaN,lng:36}}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'cursor',cursor:{lat:0,lng:Infinity}}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'cursor',cursor:{lat:9850000,lng:500000}}).success).toBe(false)
    expect(clientRoomMessageSchema.safeParse({type:'cursor',cursor:{lat:-1.2,lng:36.8}}).success).toBe(true)
  })
  test('saved-change notification cannot inject observations or a different room',()=>{
    expect(clientRoomMessageSchema.safeParse({type:'records_changed'}).success).toBe(true)
    expect(clientRoomMessageSchema.safeParse({type:'records_changed',projectId,points:[1,2]}).success).toBe(false)
  })
  test('ready acknowledgement binds protocol, identity, room, role and expiry',()=>{
    const ready={type:'ready',protocolVersion:1,userId,projectId,role:'surveyor',expiresAt:Date.now()+300000}
    expect(serverRoomMessageSchema.safeParse(ready).success).toBe(true)
    for(const change of [{protocolVersion:2},{userId:'spoof'},{projectId:'unknown'},{role:'invented'},{expiresAt:Infinity}]){
      expect(serverRoomMessageSchema.safeParse({...ready,...change}).success).toBe(false)
    }
  })
  test('validates server chat identity, id and timestamp before display',()=>{
    const chat={type:'chat',id:crypto.randomUUID(),projectId,userId,userName:'Office reviewer',message:'Review saved R1',timestamp:Date.now()}
    expect(serverRoomMessageSchema.safeParse(chat).success).toBe(true)
    expect(serverRoomMessageSchema.safeParse({...chat,userName:''}).success).toBe(false)
    expect(serverRoomMessageSchema.safeParse({...chat,timestamp:-1}).success).toBe(false)
  })
  test('presence has bounded names/colors and cannot carry arbitrary project data',()=>{
    const presence={type:'presence',projectId,payload:[{userId,userName:'Crew',color:'#3B82F6'}]}
    expect(serverRoomMessageSchema.safeParse(presence).success).toBe(true)
    expect(serverRoomMessageSchema.safeParse({...presence,payload:[{userId,userName:'Crew',color:'url(secret)'}]}).success).toBe(false)
    expect(serverRoomMessageSchema.safeParse({...presence,points:[1,2,3]}).success).toBe(false)
  })
})
