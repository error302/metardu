import {createHmac,timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import {ROOM_PROTOCOL_VERSION,roomRoleSchema,type RoomRole} from './collaborationProtocol'

export const ROOM_TICKET_TTL_MS=5*60*1000
const claimsSchema=z.object({protocolVersion:z.literal(ROOM_PROTOCOL_VERSION),userId:z.string().guid(),projectId:z.string().guid(),
  userName:z.string().trim().min(1).max(120).optional(),role:roomRoleSchema,exp:z.number().int().positive()}).strict()
export interface RoomTicketIdentity {userId:string;userName?:string;role:RoomRole;expiresAt:number}

/** Issuer inputs are server-resolved identity and role, never browser-supplied grants. */
export function signRoomTicket(secret:string,userId:string,projectId:string,userName?:string,role:RoomRole='viewer'):string {
  if(!secret.trim())throw new Error('Collaboration authentication is not configured.')
  const claims=claimsSchema.parse({protocolVersion:ROOM_PROTOCOL_VERSION,userId,projectId,userName,role,exp:Date.now()+ROOM_TICKET_TTL_MS})
  const payload=Buffer.from(JSON.stringify(claims),'utf8').toString('base64url')
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`
}

export function verifyRoomTicket(secret:string,ticket:string,projectId:string):RoomTicketIdentity|null {
  if(!secret.trim()||ticket.length>4096)return null
  try{
    const parts=ticket.split('.')
    if(parts.length!==2||!parts[0]||!parts[1]||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null
    const expected=createHmac('sha256',secret).update(parts[0]).digest()
    const given=Buffer.from(parts[1],'base64url')
    if(given.length!==expected.length||!timingSafeEqual(given,expected))return null
    const parsed=claimsSchema.safeParse(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')))
    if(!parsed.success)return null
    const claims=parsed.data,now=Date.now()
    if(claims.projectId!==projectId||claims.exp<=now||claims.exp>now+ROOM_TICKET_TTL_MS)return null
    return {userId:claims.userId,userName:claims.userName,role:claims.role,expiresAt:claims.exp}
  }catch{return null}
}
