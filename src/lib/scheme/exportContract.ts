import { z } from 'zod'
import { schemeViewportSchema, SCHEME_SHAPE_LIMIT } from './schemeView'
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
export const schemeExportHash = z.string().regex(/^[a-f0-9]{64}$/)
export const schemeExportIds = z
  .array(uuid)
  .min(1)
  .max(SCHEME_SHAPE_LIMIT)
  .refine((ids) => new Set(ids).size === ids.length, 'Select each parcel once.')
  .transform((ids) => [...ids].sort())
export const schemeExportRequestSchema = z
  .object({
    projectId: uuid,
    expectedUserId: uuid,
    requestId: uuid,
    parcelIds: schemeExportIds,
    sourceHash: schemeExportHash,
    reviewed: z.literal(true),
  })
  .strict()
export const schemeExportPreviewSchema = z
  .object({
    viewerId: uuid,
    sourceHash: schemeExportHash,
    sourceRevision: z.string().regex(/^scheme:[A-Za-z0-9_-]{43}$/),
    source: schemeViewportSchema,
  })
  .strict()
export type SchemeExportRequest = z.infer<typeof schemeExportRequestSchema>
export type SchemeExportPreview = z.infer<typeof schemeExportPreviewSchema>
export type SchemeExportFormat = 'dxf' | 'geojson'
export const schemeExportAccessSchema = z
  .object({
    viewerId: uuid,
    projectId: uuid,
    storageReady: z.boolean(),
    selectionLimit: z.literal(50),
  })
  .strict()
const historyRow = z
  .object({
    requestId: uuid,
    format: z.enum(['dxf', 'geojson']),
    outcome: z.enum(['committed', 'cancelled']),
    createdAt: z.string().datetime({ offset: true }),
    parcelCount: z.number().int().min(1).max(50),
    sourceHash: schemeExportHash,
    sourceRevision: z.string().nullable(),
    deliverableId: uuid.nullable(),
    revision: z.number().int().positive().nullable(),
    sourceCrs: z.string().nullable(),
  })
  .refine((row) =>
    row.outcome === 'committed'
      ? schemeExportHash.safeParse(row.sourceHash).success &&
        row.sourceRevision === schemeExportSourceRevision(row.sourceHash) &&
        row.deliverableId !== null &&
        row.revision !== null &&
        row.sourceCrs !== null
      : row.sourceRevision === null &&
        row.deliverableId === null &&
        row.revision === null &&
        row.sourceCrs === null,
  )
export const schemeExportHistorySchema = z
  .object({
    projectId: uuid,
    viewerId: uuid,
    page: z.number().int().positive(),
    pageSize: z.literal(24),
    total: z.number().int().nonnegative(),
    rows: z.array(historyRow).max(24),
  })
  .refine(
    (value) =>
      value.total >= value.rows.length &&
      new Set(value.rows.map((row) => row.requestId)).size ===
        value.rows.length,
  )
export type SchemeExportHistory = z.infer<typeof schemeExportHistorySchema>
export const schemeExportCancellationSchema = z
  .object({
    outcome: z.literal('cancelled'),
    projectId: uuid,
    actorId: uuid,
    requestId: uuid,
    requestHash: schemeExportHash,
    sourceHash: schemeExportHash,
    format: z.enum(['dxf', 'geojson']),
  })
  .strict()
export type SchemeExportCancellation = z.infer<
  typeof schemeExportCancellationSchema
>
export const SCHEME_EXPORT_BYTES = 4194304
/** Full SHA-256 in a 50-character register token; no truncated identity. */
export function schemeExportSourceRevision(hash: string) {
  schemeExportHash.parse(hash)
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let value = 0,
    bits = 0,
    encoded = ''
  for (let i = 0; i < hash.length; i += 2) {
    value = (value << 8) | parseInt(hash.slice(i, i + 2), 16)
    bits += 8
    while (bits >= 6) {
      bits -= 6
      encoded += alphabet[(value >>> bits) & 63]
    }
  }
  if (bits) encoded += alphabet[(value << (6 - bits)) & 63]
  return `scheme:${encoded}`
}
export function schemeExportIntent(
  body: SchemeExportRequest,
  format: SchemeExportFormat,
) {
  const { requestId: _requestId, ...rest } = body
  return { format, ...rest, parcelIds: [...body.parcelIds].sort() }
}
