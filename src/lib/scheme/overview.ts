import { z } from 'zod'

export const SCHEME_OVERVIEW_PAGE_SIZE = 24
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const schemeOverviewQuerySchema = z.object({
  block_page: z.string().regex(/^[1-9]\d{0,5}$/).prefault('1').transform(Number),
  traverse_page: z.string().regex(/^[1-9]\d{0,5}$/).prefault('1').transform(Number),
})
const blockSchema = z.object({
  id: z.string().guid(), blockNumber: z.string(), name: z.string().nullable(),
  parcelCount: count, submittedOrApproved: count,
}).refine(row => row.submittedOrApproved <= row.parcelCount)
const traverseSchema = z.object({
  id: z.string().guid(), name: z.string().nullable(), method: z.string().nullable(), status: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  precisionRatio: z.number().finite().positive().nullable(), areaHa: z.number().finite().nonnegative().nullable(),
  recordedOrder: z.string().nullable(), assessment: z.literal('unassessed'),
})
const page = { total: count, page: z.number().int().positive(), pageSize: z.literal(SCHEME_OVERVIEW_PAGE_SIZE) }
function validPage(value: { total: number; page: number; rows: unknown[] }) {
  return value.page <= Math.max(1, Math.ceil(value.total / SCHEME_OVERVIEW_PAGE_SIZE)) &&
    value.rows.length === Math.min(SCHEME_OVERVIEW_PAGE_SIZE, Math.max(0, value.total - (value.page - 1) * SCHEME_OVERVIEW_PAGE_SIZE))
}
export const schemeOverviewSchema = z.object({
  project: z.object({ id: z.string().guid(), name: z.string(), location: z.string().nullable(), projectType: z.literal('scheme') }),
  parcels: z.object({
    total: count,
    statusCounts: z.object({ pending: count, field_complete: count, computed: count, plan_generated: count, submitted: count, approved: count }),
    unrecognized: count, unassignedBlock: count, invalidBlock: count,
  }).refine(value => Object.values(value.statusCounts).reduce((sum, number) => sum + number, 0) + value.unrecognized === value.total && value.unassignedBlock + value.invalidBlock <= value.total),
  blocks: z.object({ ...page, rows: z.array(blockSchema).max(SCHEME_OVERVIEW_PAGE_SIZE) }).refine(validPage),
  traverses: z.object({ ...page, computed: count, rows: z.array(traverseSchema).max(SCHEME_OVERVIEW_PAGE_SIZE) }).refine(value => validPage(value) && value.computed <= value.total),
}).refine(value => new Set(value.blocks.rows.map(row => row.id)).size === value.blocks.rows.length && new Set(value.traverses.rows.map(row => row.id)).size === value.traverses.rows.length && value.blocks.rows.reduce((sum, row) => sum + row.parcelCount, 0) <= value.parcels.total - value.parcels.unassignedBlock - value.parcels.invalidBlock)
export type SchemeOverviewData = z.infer<typeof schemeOverviewSchema>
export const schemeOverviewResponseSchema = z.object({ data: schemeOverviewSchema })
