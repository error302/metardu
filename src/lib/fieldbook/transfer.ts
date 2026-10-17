import { z } from 'zod'

const text = z.string().max(10000)
const row = z.object({ id: text.optional(), remarks: text.default('') })
const leveling = z.object({
  method: z.enum(['rise_and_fall', 'height_of_collimation']), openingRL: text,
  closingRL: text, distanceKm: text,
  rows: z.array(row.extend({ station: text, bs: text, is: text, fs: text })).max(100000),
})
const traverse = z.object({
  mode: z.enum(['open', 'closed', 'link']), startStation: text, startE: text, startN: text, closeE: text, closeN: text,
  rows: z.array(row.extend({ station: text, bearing: text, slopeDist: text,
    hclDeg: text, hclMin: text, hclSec: text, hcrDeg: text, hcrMin: text, hcrSec: text,
    vaDeg: text, vaMin: text, vaSec: text, ih: text, th: text })).max(100000),
})
const controlRow = row.extend({ pointId: text, instrumentHeight: text, targetHeight: text,
  bearing: text, verticalAngle: text, slopeDistance: text })
const control = z.object({ activeSetupId: text, setups: z.array(z.object({ id: text,
  station: z.object({ name: text, e: text, n: text, z: text }), rows: z.array(controlRow).max(100000),
})).min(1).max(10000) })
const base = z.object({ name: text, projectId: text.optional(), version: z.literal(1).optional() })
export const fieldbookTransferSchema = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('leveling'), data: leveling }),
  base.extend({ type: z.literal('traverse'), data: traverse }),
  base.extend({ type: z.literal('control'), data: control }),
])
export type FieldbookTransfer = z.infer<typeof fieldbookTransferSchema>

/** Validate before touching the open book; raw strings are never coerced into coordinates. */
export function parseFieldbookTransfer(content: string): FieldbookTransfer {
  if (new TextEncoder().encode(content).length > 10 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 10 MB.')
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new Error('This file is not valid JSON. Choose a METARDU fieldbook export.') }
  const result = fieldbookTransferSchema.safeParse(parsed)
  if (!result.success) throw new Error('This is not a supported METARDU fieldbook. Its observations and setup fields must be complete. Your open book has not changed.')
  return result.data
}
