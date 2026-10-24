/** Shared wire contract; importing this module must not pull server/DB code into clients. */
import { z } from 'zod'

export const requestUuid = z.string().uuid().transform(value => value.toLowerCase())
export const requestHash = z.string().regex(/^[a-f0-9]{64}$/)
const vertex = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
const sourceLabel = z.string().trim().min(1).max(500).refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Use a single-line source description.')
const domainXY = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
export const terrainDomainSchema = z.object({ horizontalCrs: z.string().trim().min(1), units: z.literal('metres'), sourceLabel,
  supportUseReviewed: z.literal(true), regions: z.array(z.object({ outer: z.array(domainXY).min(3).max(2001), holes: z.array(z.array(domainXY).min(3).max(2001)).max(64) }).strict()).min(1).max(32) }).strict()
export const breaklineChainSchema = z.object({ name: z.string().trim().max(150).optional(), type: z.enum(['hard','soft','ridge','valley']), sourceLabel,
  reviewed: z.literal(true), pointIds: z.array(requestUuid).min(2).max(2001) }).strict()
export const surfaceBreakline = z.object({ name: z.string().trim().max(150).optional(),
  type: z.enum(['hard', 'soft', 'ridge', 'valley']).default('hard'), points: z.array(vertex).min(2).max(2001) })
export const surfaceRequestSchema = z.object({
  requestId: requestUuid,
  expectedUserId: requestUuid,
  surfaceId: requestUuid.optional(),
  name: z.string().trim().min(1).max(150).default('Existing ground'), description: z.string().max(4000).optional(),
  pointIds: z.array(requestUuid).min(3).max(10000).refine(ids => new Set(ids).size === ids.length, 'Select each source point once.'),
  expectedReferenceHash: requestHash, expectedSourceHash: requestHash,
  breaklineReference: z.object({ horizontalCrs: z.string().trim().min(1), verticalDatum: z.string().trim().min(1), units: z.literal('metres') }).strict().optional(),
  useStoredBreaklines: z.boolean().default(true), breaklines: z.array(surfaceBreakline).max(2000).optional(),
  terrainDomain: terrainDomainSchema.optional(), breaklineChains: z.array(breaklineChainSchema).max(2000).optional(),
  interval: z.number().finite().min(0.001).max(1000000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, 'Contour interval must be a multiple of 0.001 m.').default(1),
  resolution: z.number().finite().positive().default(1),
}).strict()
export const surfaceExportRequestSchema = z.object({ projectId: requestUuid, surfaceRevisionId: requestUuid, requestId: requestUuid, expectedUserId: requestUuid }).strict()
export const retainedRequestSchema = z.object({ id: requestUuid, userId: requestUuid, payloadHash: requestHash }).strict()
export type SurfaceRequest = z.infer<typeof surfaceRequestSchema>
export type SurfaceExportRequest = z.infer<typeof surfaceExportRequestSchema>

export function surfaceRequestPayload(body: SurfaceRequest) {
  const value: Partial<SurfaceRequest> = { ...body }
  delete value.requestId
  return { ...value, pointIds: [...body.pointIds].sort() }
}
export function surfaceExportPayload(body: SurfaceExportRequest) {
  return { projectId: body.projectId, surfaceRevisionId: body.surfaceRevisionId, expectedUserId: body.expectedUserId }
}
export interface ReviewedSurfacePoint {
  id: string; pointName: string | null; x: number; y: number; z: number; code: string | null
  horizontalCrs: string; verticalDatum: string
}
/** The reviewed measurements, names, codes and source references; no guessed height. */
export function surfaceReviewValue(referenceHash: string, points: ReviewedSurfacePoint[]) {
  return { version: 1, referenceHash, points: points.map(point => ({ id: point.id, pointName: point.pointName, x: point.x, y: point.y, z: point.z,
    horizontalCrs: point.horizontalCrs, verticalDatum: point.verticalDatum, code: point.code || 'UNK' })).sort((a, b) => a.id.localeCompare(b.id)) }
}
