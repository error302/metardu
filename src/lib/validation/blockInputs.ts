import { z } from 'zod'
const number = z.string().trim().min(1).max(20)
const name = z.string().trim().max(100).nullable().optional()
const description = z.string().trim().max(500).nullable().optional()
export const CreateBlockSchema = z.object({
  project_id: z.string().uuid(),
  block_number: number,
  block_name: name,
  description,
})
export const UpdateBlockSchema = z.object({
  project_id: z.string().uuid().optional(),
  block_number: number.optional(),
  block_name: name,
  description,
  updated_at: z.string().datetime({ offset: true }).optional(),
  row_version: z.string().regex(/^\d+$/).optional(),
})
export const DeleteBlockSchema = z.object({
  project_id: z.string().uuid().optional(),
  updated_at: z.string().datetime({ offset: true }),
  row_version: z.string().regex(/^\d+$/).optional(),
})
