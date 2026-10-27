import { z } from 'zod'
import { roadDesignDataSchema } from './roadDesignSchema'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { sha256Hex } from '@/lib/crypto/sha256'
export const ROAD_RECOVERY_LIMIT = 3 * 1024 * 1024
export const roadHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const uuid = z.string().guid()
export const roadRecoveryReferenceSchema = z
  .object({
    code: z.string().nullable(),
    verticalDatum: z.string().nullable(),
    distanceMode: z.enum(['grid', 'ground']).nullable(),
  })
  .strict()
export const roadWorkbenchSourceSchema = z
  .object({
    version: z.literal(1),
    actorId: uuid,
    projectId: uuid,
    engineeringHash: roadHashSchema,
    referenceHash: roadHashSchema,
    road: roadDesignDataSchema,
    reference: roadRecoveryReferenceSchema,
  })
  .strict()
export type RoadWorkbenchSource = z.infer<typeof roadWorkbenchSourceSchema>
export const roadWorkbenchCommandSchema = z
  .object({
    version: z.literal(1),
    actorId: uuid,
    projectId: uuid,
    requestId: uuid,
    expectedEngineeringHash: roadHashSchema,
    expectedReferenceHash: roadHashSchema,
    road: roadDesignDataSchema,
  })
  .strict()
export type RoadWorkbenchCommand = z.infer<typeof roadWorkbenchCommandSchema>
const identity = {
  version: z.literal(1),
  actorId: uuid,
  projectId: uuid,
  requestId: uuid,
  requestHash: roadHashSchema,
}
export const roadWorkbenchOutcomeSchema = z.discriminatedUnion('state', [
  z
    .object({
      ...identity,
      state: z.literal('committed'),
      roadHash: roadHashSchema,
      engineeringHash: roadHashSchema,
      referenceHash: roadHashSchema,
      road: roadDesignDataSchema,
      reference: roadRecoveryReferenceSchema,
    })
    .strict(),
  z.object({ ...identity, state: z.literal('cancelled') }).strict(),
])
export type RoadWorkbenchOutcome = z.infer<typeof roadWorkbenchOutcomeSchema>
export const roadRequestDigest = (command: RoadWorkbenchCommand) =>
  sha256Hex(canonicalJson(command))
export function normalizedRoadJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
