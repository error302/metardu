import { z } from 'zod'
export const BLOCK_DIRECTORY_PAGE_SIZE = 24
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const blockDirectoryQuerySchema = z.object({
  page: z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .default('1')
    .transform(Number),
  q: z.string().trim().max(80).default(''),
})
export const blockCommandRowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  block_number: z.string(),
  block_name: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z
    .union([z.date(), z.string().datetime({ offset: true })])
    .nullable()
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value,
    ),
  updated_at: z
    .string()
    .datetime({ offset: true })
    .regex(/\.\d{6}Z$/),
  row_version: z.string().regex(/^\d+$/),
})
export const blockCommandResponseSchema = z.object({
  data: blockCommandRowSchema,
})
export const blockDeleteResponseSchema = z.object({
  data: z.object({
    deletedId: z.string().uuid(),
    projectId: z.string().uuid(),
    rowVersion: z.string().regex(/^\d+$/),
  }),
})
export const blockDirectoryRowSchema = blockCommandRowSchema.extend({
  parcel_count: count,
  completed_count: count,
  assignment_count: count,
  has_import_receipts: z.boolean().nullable(),
  has_geometry: z.boolean(),
  can_delete: z.boolean(),
})
export const blockDirectoryResponseSchema = z
  .object({
    project: z.object({
      id: z.string().uuid(),
      name: z.string(),
      projectType: z.string().nullable(),
      canCreate: z.boolean(),
    }),
    summary: z.object({
      blocks: count,
      parcels: count,
      submittedOrApproved: count,
      unassignedParcels: count,
      invalidBlockLinks: count,
      receiptRetention: z.enum(['available', 'unavailable']),
    }),
    meta: z.object({
      page: z.number().int().positive(),
      pageSize: z.literal(BLOCK_DIRECTORY_PAGE_SIZE),
      total: count,
      search: z.string().max(80),
    }),
    data: z.array(blockDirectoryRowSchema).max(BLOCK_DIRECTORY_PAGE_SIZE),
  })
  .refine(
    (value) =>
      value.project.canCreate === (value.project.projectType === 'scheme') &&
      value.meta.total <= value.summary.blocks &&
      value.meta.page <=
        Math.max(1, Math.ceil(value.meta.total / BLOCK_DIRECTORY_PAGE_SIZE)) &&
      value.data.length ===
        Math.min(
          BLOCK_DIRECTORY_PAGE_SIZE,
          Math.max(
            0,
            value.meta.total -
              (value.meta.page - 1) * BLOCK_DIRECTORY_PAGE_SIZE,
          ),
        ) &&
      new Set(value.data.map((row) => row.id)).size === value.data.length &&
      value.data.every(
        (row) =>
          row.project_id === value.project.id &&
          row.completed_count <= row.parcel_count &&
          (value.summary.receiptRetention === 'available'
            ? typeof row.has_import_receipts === 'boolean'
            : row.has_import_receipts === null) &&
          row.can_delete ===
            (value.summary.receiptRetention === 'available' &&
              row.has_import_receipts === false &&
              !row.has_geometry &&
              row.parcel_count === 0 &&
              row.assignment_count === 0),
      ) &&
      value.summary.unassignedParcels + value.summary.invalidBlockLinks <=
        value.summary.parcels &&
      value.summary.submittedOrApproved <= value.summary.parcels,
  )
export type BlockDirectoryData = z.infer<typeof blockDirectoryResponseSchema>
export type BlockDirectoryRow = z.infer<typeof blockDirectoryRowSchema>
