import { z } from 'zod'
const uuid = z
  .string()
  .guid()
  .transform((value) => value.toLowerCase())
export const parcelShareHash = z.string().regex(/^[a-f0-9]{64}$/)
export const parcelShareKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
])
const ring = z
  .array(position)
  .min(4)
  .max(5001)
  .refine((points) => {
    if (points.length < 4) return false
    const last = points[points.length - 1]
    if (points[0][0] !== last[0] || points[0][1] !== last[1]) return false
    return points.every(
      (point, index) =>
        index === 0 || Math.abs(point[0] - points[index - 1][0]) <= 180,
    )
  })
export const parcelShareSnapshotSchema = z
  .object({
    protocol: z.literal('parcel-draft-share-v1'),
    assessment: z.literal('unverified_draft'),
    sourceCrs: z.string().min(1).max(100),
    sourceHash: parcelShareHash,
    sourceRevision: z.string().regex(/^scheme:[A-Za-z0-9_-]{43}$/),
    artifactHash: parcelShareHash,
    exportRevision: z.number().int().positive(),
    dimensions: z.literal(2),
    heights: z.literal('not provided'),
    professionalApproval: z.literal(false),
    fieldVerified: z.literal(false),
    parcels: z
      .array(
        z
          .object({
            label: z.string().max(500),
            gridAreaSqM: z.number().finite().positive(),
            coordinates: z.array(ring).min(1).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (data) =>
      data.parcels.reduce(
        (sum, parcel) =>
          sum + parcel.coordinates.reduce((n, points) => n + points.length, 0),
        0,
      ) <= 30000,
  )
export type ParcelShareSnapshot = z.infer<typeof parcelShareSnapshotSchema>
export const parcelShareCommandSchema = z
  .object({
    projectId: uuid,
    expectedUserId: uuid,
    requestId: uuid,
    exportRequestId: uuid,
    snapshotHash: parcelShareHash,
    durationDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
    authorityToShare: z.literal(true),
    key: parcelShareKey,
  })
  .strict()
export type ParcelShareCommand = z.infer<typeof parcelShareCommandSchema>
const hasShareDuration = (row: { createdAt: string; expiresAt: string }) =>
  [1, 7, 30].some(
    (days) =>
      Date.parse(row.expiresAt) - Date.parse(row.createdAt) === days * 86400000,
  )
export const parcelShareReceiptSchema = z
  .object({
    id: uuid,
    projectId: uuid,
    viewerId: uuid,
    exportRequestId: uuid,
    snapshotHash: parcelShareHash,
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(hasShareDuration)
  .refine(
    (row) =>
      row.revokedAt === null ||
      Date.parse(row.revokedAt) >= Date.parse(row.createdAt),
  )
export type ParcelShareReceipt = z.infer<typeof parcelShareReceiptSchema>
export const parcelSharePreviewSchema = z
  .object({
    projectId: uuid,
    viewerId: uuid,
    exportRequestId: uuid,
    snapshotHash: parcelShareHash,
    snapshot: parcelShareSnapshotSchema,
  })
  .strict()
export const parcelShareListSchema = z
  .object({
    projectId: uuid,
    viewerId: uuid,
    page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    rows: z.array(parcelShareReceiptSchema).max(24),
  })
  .strict()
  .refine(
    (data) =>
      data.rows.every(
        (row) =>
          row.projectId === data.projectId && row.viewerId === data.viewerId,
      ) &&
      new Set(data.rows.map((row) => row.id)).size === data.rows.length &&
      data.total >= data.rows.length,
  )
export const publicParcelShareSchema = z
  .object({
    id: uuid,
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    snapshotHash: parcelShareHash,
    snapshot: parcelShareSnapshotSchema,
  })
  .strict()
  .refine(hasShareDuration)
export const PARCEL_SHARE_BYTES = 4194304
