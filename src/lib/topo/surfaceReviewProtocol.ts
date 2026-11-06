import {z} from 'zod'
import {roomRoleSchema} from '@/lib/realtime/collaborationProtocol'
const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const surfaceReviewCommandSchema=z.object({projectId:z.string().guid(),sourceRevisionId:z.string().guid(),
  expectedSourceHash:hash,requestId:z.string().guid(),outcome:z.enum(['changes_requested','reviewed_for_draft']),note:z.string().trim().min(1).max(4000)}).strict()
export type SurfaceReviewCommand=z.infer<typeof surfaceReviewCommandSchema>
export const surfaceReviewReceiptSchema=z.object({id:z.string().guid(),projectId:z.string().guid(),sourceRevisionId:z.string().guid(),
  sourceHash:hash,sourceReferenceHash:hash,sourceOutputHash:hash,actorId:z.string().guid(),requestId:z.string().guid(),
  outcome:z.enum(['changes_requested','reviewed_for_draft']),note:z.string().min(1).max(4000),createdAt:z.iso.datetime(),replayed:z.boolean(),
  professionalApproval:z.literal(false),fieldVerified:z.literal(false)}).strict()
export const surfaceReviewReadSchema=z.object({role:roomRoleSchema,source:z.object({revisionId:z.string().guid(),inputHash:hash,referenceHash:hash,outputHash:hash,current:z.boolean()}).strict(),
  reviews:z.array(surfaceReviewReceiptSchema).max(100),historyLimited:z.boolean()}).strict()
