import { z } from 'zod'
import { parcelStatusSchema } from './scheme'

const parcelArea = z.number().finite().positive().max(999999.999999)
  .refine(value => Math.abs(value * 1e6 - Math.round(value * 1e6)) < 1e-6, 'Area must be representable to six decimal places in hectares')
  .transform(value => Math.round(value * 1e6) / 1e6)
export const CreateParcelSchema = z.object({
  project_id:z.string().uuid().optional(),block_id:z.string().uuid(),parcel_number:z.string().trim().min(1).max(30),
  lr_number_proposed:z.string().trim().max(50).nullable().optional(),area_ha:parcelArea.nullable().optional(),notes:z.string().trim().max(1000).nullable().optional(),
})
export const UpdateParcelSchema = z.object({
  project_id:z.string().uuid().optional(),block_id:z.string().uuid().optional(),base_revision:z.number().int().nonnegative().max(2147483646).optional(),
  parcel_number:z.string().trim().min(1).max(30).optional(),lr_number_proposed:z.string().trim().max(50).nullable().optional(),lr_number_confirmed:z.string().trim().max(50).nullable().optional(),
  area_ha:parcelArea.nullable().optional(),status:parcelStatusSchema.optional(),assigned_surveyor:z.string().uuid().nullable().optional(),notes:z.string().trim().max(1000).nullable().optional(),updated_at:z.string().datetime({offset:true}).optional(),
})
