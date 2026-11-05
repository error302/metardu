/** @jest-environment node */
import {createHmac} from 'node:crypto'
import {signRoomTicket,verifyRoomTicket,ROOM_TICKET_TTL_MS} from '../roomTicket'

const secret='unit-test-room-secret-never-use-in-production'
const userId='5a278317-81db-4db9-b9b6-d5f8ca10ec38'
const projectId='242f3a64-f1cf-4b7f-96a0-70e86aa5b616'
const now=1793904000000
beforeEach(()=>jest.spyOn(Date,'now').mockReturnValue(now))
afterEach(()=>jest.restoreAllMocks())
const signed=(value:unknown)=>{
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`
}
const claims={protocolVersion:1,userId,projectId,userName:'Crew',role:'surveyor',exp:now+300000}

describe('signed role-bound expiring room grants',()=>{
  test('binds identity, role, exact project and expiry',()=>{
    const ticket=signRoomTicket(secret,userId,projectId,'Crew','surveyor')
    expect(verifyRoomTicket(secret,ticket,projectId)).toEqual({userId,userName:'Crew',role:'surveyor',expiresAt:now+ROOM_TICKET_TTL_MS})
    expect(verifyRoomTicket(secret,ticket,userId)).toBeNull()
    expect(verifyRoomTicket(secret+'wrong',ticket,projectId)).toBeNull()
  })
  test('no explicit write role means viewer, never an editing grant',()=>{
    const ticket=signRoomTicket(secret,userId,projectId,'Office observer')
    expect(verifyRoomTicket(secret,ticket,projectId)?.role).toBe('viewer')
  })
  test('expires at the boundary, not one millisecond after it',()=>{
    expect(verifyRoomTicket(secret,signed({...claims,exp:now}),projectId)).toBeNull()
    expect(verifyRoomTicket(secret,signed({...claims,exp:now-1}),projectId)).toBeNull()
    expect(verifyRoomTicket(secret,signed({...claims,exp:now+1}),projectId)).not.toBeNull()
  })
  test.each([
    {role:'invented-admin'},{role:null},{protocolVersion:2},{protocolVersion:undefined},
    {userId:''},{projectId:'not-a-guid'},{exp:Infinity},{exp:now+ROOM_TICKET_TTL_MS+1},
    {userName:'x'.repeat(121)},{unexpected:'claim'}
  ])('even signed malformed claims fail closed: %p',change=>{
    expect(verifyRoomTicket(secret,signed({...claims,...change}),projectId)).toBeNull()
  })
  test('rejects missing secret, malformed signature and excessive ticket input',()=>{
    const ticket=signRoomTicket(secret,userId,projectId,'Crew','owner')
    expect(()=>signRoomTicket('',userId,projectId,'Crew')).toThrow()
    expect(verifyRoomTicket('',ticket,projectId)).toBeNull()
    expect(verifyRoomTicket(secret,ticket+'.tampered',projectId)).toBeNull()
    expect(verifyRoomTicket(secret,'x'.repeat(4097),projectId)).toBeNull()
  })
})
