import { z } from 'zod'
import { parcelStatusSchema } from '@/lib/validation/scheme'

export const BLOCK_REGISTER_PAGE_SIZE = 50
export const blockRegisterQuerySchema = z.object({
  page:z.string().regex(/^[1-9]\d{0,5}$/).default('1').transform(Number),
  status:z.union([z.literal('all'),z.literal('unrecognized'),parcelStatusSchema]).default('all'),
  q:z.string().trim().max(80).default(''),
})
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const exactVersion=z.string().datetime({offset:true}).regex(/\.\d{6}Z$/)
export const blockParcelRowSchema=z.object({
  id:z.string().uuid(),project_id:z.string().uuid(),block_id:z.string().uuid(),parcel_number:z.string(),
  lr_number_proposed:z.string().nullable(),lr_number_confirmed:z.string().nullable(),
  area_text:z.string().nullable(),area_ha:z.number().finite().nullable(),area_state:z.enum(['known','unknown','invalid']),
  status:z.string().nullable(),assigned_surveyor:z.string().uuid().nullable(),notes:z.string().nullable(),
  updated_at:exactVersion,revision_number:count,can_delete:z.boolean(),
})
export const blockRegisterSchema=z.object({
  project:z.object({id:z.string().uuid(),name:z.string()}),
  block:z.object({id:z.string().uuid(),projectId:z.string().uuid(),number:z.string(),name:z.string().nullable(),description:z.string().nullable()}),
  summary:z.object({total:count,knownAreaCount:count,unknownAreaCount:count,invalidAreaCount:count,knownAreaHa:z.string().regex(/^\d+(?:\.\d+)?$/),submittedOrApproved:count,
    statusCounts:z.object({pending:count,field_complete:count,computed:count,plan_generated:count,submitted:count,approved:count}),unrecognizedStatusCount:count,
  }).refine(value=>value.knownAreaCount+value.unknownAreaCount+value.invalidAreaCount===value.total&&Object.values(value.statusCounts).reduce((sum,n)=>sum+n,0)+value.unrecognizedStatusCount===value.total&&value.submittedOrApproved===value.statusCounts.submitted+value.statusCounts.approved),
  register:z.object({total:count,page:z.number().int().positive(),pageSize:z.literal(BLOCK_REGISTER_PAGE_SIZE),search:z.string().max(80),status:z.union([z.literal('all'),z.literal('unrecognized'),parcelStatusSchema]),rows:z.array(blockParcelRowSchema).max(BLOCK_REGISTER_PAGE_SIZE)}),
}).refine(value=>value.block.projectId===value.project.id&&value.register.total<=value.summary.total&&value.register.page<=Math.max(1,Math.ceil(value.register.total/BLOCK_REGISTER_PAGE_SIZE))&&value.register.rows.length===Math.min(BLOCK_REGISTER_PAGE_SIZE,Math.max(0,value.register.total-(value.register.page-1)*BLOCK_REGISTER_PAGE_SIZE))&&new Set(value.register.rows.map(row=>row.id)).size===value.register.rows.length&&value.register.rows.every(row=>row.project_id===value.project.id&&row.block_id===value.block.id))
export const blockRegisterResponseSchema=z.object({data:blockRegisterSchema})
export type BlockRegisterData=z.infer<typeof blockRegisterSchema>
export type BlockParcelRow=z.infer<typeof blockParcelRowSchema>
/** Format exact supplied hectare totals without rounding them through a float. */
export function formatRegisterArea(value:string){const [integer,fraction]=value.split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?`.${fraction}`:'')}
