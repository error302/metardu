import { z } from 'zod'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
function json(value: unknown, depth = 0): value is Json {
  if (depth > 32) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(item => json(item, depth + 1))
  return typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]'
    && Object.values(value as Record<string, unknown>).every(item => json(item, depth + 1))
}
// Validate without cloning/coercing raw keys, including an own __proto__ key.
const data = z.custom<Record<string, Json>>(value => value !== null && typeof value === 'object' && !Array.isArray(value) && json(value))
const revisionPattern = /^(0|[1-9][0-9]{0,18})$/
export const bookRevisionSchema = z.string().regex(revisionPattern).refine(value => revisionPattern.test(value) && BigInt(value) <= BigInt('9223372036854775807'))
export const fieldbookSaveRequestSchema = z.object({
  protocol: z.literal('fieldbook-save-v1'),
  requestId: z.string().guid(), projectId: z.string().guid(), bookId: z.string().guid(),
  baseRevision: bookRevisionSchema.nullable(), type: z.enum(['leveling', 'traverse', 'control']),
  name: z.string().max(255), data,
}).strict()
export type FieldbookSaveRequest = z.infer<typeof fieldbookSaveRequestSchema>
export const fieldbookSnapshotSchema = z.object({ id: z.string().guid(), project_id: z.string().guid(), user_id: z.string().guid(),
  type: z.string(), name: z.string().nullable(), data, status: z.string().nullable(), revision: bookRevisionSchema,
  created_at: z.string().nullable(), updated_at: z.string().nullable(),
}).strict()
export type FieldbookSnapshot = z.infer<typeof fieldbookSnapshotSchema>
export const fieldbookSaveReceiptSchema = z.object({ protocol: z.literal('fieldbook-save-v1'), fieldVerified: z.literal(false), requestId: z.string().guid(), actorId: z.string().guid(), projectId: z.string().guid(), bookId: z.string().guid(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/), payloadHash: z.string().regex(/^[a-f0-9]{64}$/), baseRevision: bookRevisionSchema.nullable(), savedRevision: bookRevisionSchema })
export type FieldbookSaveReceipt = z.infer<typeof fieldbookSaveReceiptSchema>
export interface FieldbookSaveResult { receipt: FieldbookSaveReceipt; book: FieldbookSnapshot; currentRevision: string | null; replayed: boolean }

/** New delivery protocol's canonical JSON; never silently drop special raw property names. */
export function canonicalDeliveryJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDeliveryJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalDeliveryJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function fieldbookEditablePayload(actorId: string, input: Pick<FieldbookSaveRequest, 'bookId' | 'projectId' | 'type' | 'name' | 'data'>) {
  return { id: input.bookId, user_id: actorId, project_id: input.projectId, type: input.type, name: input.name, data: input.data }
}
