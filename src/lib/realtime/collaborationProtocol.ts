/** Shared room contract. Saved survey geometry travels only through authorized durable APIs. */
import { z } from 'zod'

export const ROOM_PROTOCOL_VERSION = 1
export const roomRoleSchema = z.enum(['owner','super_admin','org_admin','project_manager','surveyor','viewer'])
export type RoomRole = z.infer<typeof roomRoleSchema>
export interface RoomPermissions { canChat: boolean; canNotifyChange: boolean; canShareCursor: boolean }

/** Unknown/legacy role strings must never silently acquire room write access. */
export function roomPermissions(role: unknown): RoomPermissions | null {
  const parsed = roomRoleSchema.safeParse(role)
  if (!parsed.success) return null
  const canWrite = parsed.data !== 'viewer'
  return { canChat: canWrite, canNotifyChange: canWrite, canShareCursor: canWrite }
}

const uuid = z.string().guid()
const time = z.number().int().nonnegative()
const cursor = z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)}).strict()
const message = z.string().trim().min(1).max(2000)
const userName = z.string().trim().min(1).max(120)
export const roomPeerSchema = z.object({userId:uuid,userName,color:z.string().regex(/^#[a-fA-F0-9]{6}$/),cursor:cursor.optional()}).strict()

export const clientRoomMessageSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('ping')}).strict(),
  z.object({type:z.literal('chat'),message}).strict(),
  z.object({type:z.literal('cursor'),cursor}).strict(),
  z.object({type:z.literal('records_changed')}).strict(),
])
export type ClientRoomMessage = z.infer<typeof clientRoomMessageSchema>

export const serverRoomMessageSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('ready'),protocolVersion:z.literal(ROOM_PROTOCOL_VERSION),userId:uuid,projectId:uuid,role:roomRoleSchema,expiresAt:time}).strict(),
  z.object({type:z.literal('presence'),projectId:uuid,payload:z.array(roomPeerSchema).max(200)}).strict(),
  z.object({type:z.literal('chat'),id:uuid,projectId:uuid,userId:uuid,userName,message,timestamp:time}).strict(),
  z.object({type:z.literal('records_changed'),projectId:uuid,userId:uuid,timestamp:time}).strict(),
  z.object({type:z.literal('pong'),projectId:uuid,timestamp:time}).strict(),
  z.object({type:z.literal('error'),code:z.enum(['READ_ONLY','INVALID_MESSAGE','RATE_LIMITED']),message:z.string().min(1).max(300)}).strict(),
])
export type ServerRoomMessage = z.infer<typeof serverRoomMessageSchema>
export type RoomPeer = z.infer<typeof roomPeerSchema>
