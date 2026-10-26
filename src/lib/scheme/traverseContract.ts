import { z } from 'zod'
import {
  computeTraverse,
  parseTraverseDecimal,
} from '@/lib/computations/traverseEngine'
import {
  assertProjectedCrs,
  validateCoordinateRange,
} from '@/lib/spatial/projectCrs'

export const TRAVERSE_PROTOCOL = 'metardu-parcel-traverse-v1' as const
export const TRAVERSE_ENGINE = 'paired-face-zenith-grid-bowditch-v3' as const
export const TRAVERSE_BODY_LIMIT = 4194304
export const TRAVERSE_OBSERVATION_LIMIT = 2000
const uuid = z.string().uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const numericText = z.string().max(64)
const name = z
  .string()
  .min(1)
  .max(50)
  .refine((v) => v.trim().length > 0)
const observation = z
  .object({
    station: name,
    bs: z.string().max(50),
    fs: z.string().max(50),
    hclDeg: numericText,
    hclMin: numericText,
    hclSec: numericText,
    hcrDeg: numericText,
    hcrMin: numericText,
    hcrSec: numericText,
    slopeDist: numericText,
    vaDeg: numericText,
    vaMin: numericText,
    vaSec: numericText,
    ih: numericText,
    th: numericText,
    remarks: z.string().max(500).optional(),
  })
  .strict()
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual'), note: z.string().max(500) }).strict(),
  z
    .object({
      kind: z.literal('attachment'),
      filename: z
        .string()
        .min(1)
        .max(180)
        .regex(/^[^/\\\x00-\x1f]+$/),
      bytesBase64: z
        .string()
        .min(4)
        .max(2796204)
        .regex(
          /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        ),
      mappingReviewed: z.literal(true),
    })
    .strict(),
])
export const traverseCommandSchema = z
  .object({
    protocol: z.literal(TRAVERSE_PROTOCOL),
    requestId: uuid,
    expectedUserId: uuid,
    projectId: uuid,
    parcelId: uuid,
    evidenceHash: hash,
    sourceCrs: z.string().min(1).max(32),
    baseRevisionId: uuid.nullable(),
    derivedFromRevisionId: uuid.nullable(),
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((v) => v.trim().length > 0),
    convention: z.literal('clockwise_bs_to_fs_face_pair_zenith_metres'),
    control: z
      .object({
        openingStation: name,
        openingEasting: numericText,
        openingNorthing: numericText,
        openingRL: numericText,
        closing: z
          .object({
            station: name,
            easting: numericText,
            northing: numericText,
          })
          .strict()
          .nullable(),
        backsightDegrees: numericText,
        backsightMinutes: numericText,
        backsightSeconds: numericText,
      })
      .strict(),
    reduction: z
      .object({
        combinedScaleFactor: numericText,
        reference: z
          .string()
          .min(1)
          .max(200)
          .refine((v) => v.trim().length > 0),
      })
      .strict(),
    criterion: z
      .object({
        allowableMisclosureMm: numericText,
        reference: z
          .string()
          .min(1)
          .max(200)
          .refine((v) => v.trim().length > 0),
      })
      .strict()
      .nullable(),
    observations: z.array(observation).min(1).max(TRAVERSE_OBSERVATION_LIMIT),
    source,
    provenance: z
      .object({
        observer: z.string().max(200).nullable(),
        instrument: z.string().max(200).nullable(),
        observedAt: z.string().max(100).nullable(),
      })
      .strict(),
    reviewed: z.literal(true),
  })
  .strict()
export type TraverseCommand = z.infer<typeof traverseCommandSchema>
const identity = z.object({
  requestId: uuid,
  actorId: uuid,
  projectId: uuid,
  parcelId: uuid,
  inputHash: hash,
})
export const traverseReceiptSchema = identity
  .extend({
    state: z.literal('committed'),
    revisionId: uuid,
    traverseId: uuid,
    ordinal: z.number().int().positive(),
    engineVersion: z.literal(TRAVERSE_ENGINE),
    sourceHash: hash,
    resultHash: hash,
    referenceHash: hash,
    requestHash: hash,
    coordinateIds: z
      .array(uuid)
      .min(2)
      .max(TRAVERSE_OBSERVATION_LIMIT + 1),
    observationIds: z.array(uuid).min(1).max(TRAVERSE_OBSERVATION_LIMIT),
    createdAt: z.string().datetime({ offset: true }),
    status: z.literal('draft_unverified'),
  })
  .strict()
export const traverseCancellationSchema = identity
  .extend({ state: z.literal('cancelled') })
  .strict()
export const traverseOutcomeSchema = z.discriminatedUnion('state', [
  traverseReceiptSchema,
  traverseCancellationSchema,
])
export type TraverseReceipt = z.infer<typeof traverseReceiptSchema>
export type TraverseOutcome = z.infer<typeof traverseOutcomeSchema>
export const cancelTraverseSchema = z
  .object({
    expectedUserId: uuid,
    projectId: uuid,
    parcelId: uuid,
    requestId: uuid,
    inputHash: hash,
  })
  .strict()
export const traverseContextSchema = z
  .object({
    actorId: uuid,
    projectId: uuid,
    parcelId: uuid,
    evidenceHash: hash,
    latestRevisionId: uuid.nullable(),
    sourceCrs: z.string().nullable(),
    adoptedFactor: z.string().nullable(),
    verticalDatum: z.string().nullable(),
    prerequisites: z.array(z.string()),
    storageReady: z.literal(true),
  })
  .strict()
export type TraverseContext = z.infer<typeof traverseContextSchema>
const finite = z.number().finite()
export const retainedTraverseResultSchema = z
  .object({
    rawObservations: z.array(observation),
    legs: z.array(
      z
        .object({
          from: z.string(),
          to: z.string(),
          meanAngleDMS: z.string(),
          wcbDMS: z.string(),
          hd: finite,
          adjDep: finite,
          adjLat: finite,
        })
        .passthrough(),
    ),
    coordinates: z.array(
      z
        .object({
          station: z.string(),
          easting: finite,
          northing: finite,
          rl: finite.optional(),
        })
        .strict(),
    ),
    totalPerimeter: finite,
    horizontalScaleFactor: finite,
    linearError: finite.nullable(),
    precisionRatio: finite.nullable(),
    C_mm: finite.nullable(),
    allowable: finite.nullable(),
    accuracyOrder: z.string(),
    formula: z.string(),
    isClosed: z.boolean(),
    assessment: z
      .object({
        status: z.enum(['not_assessed', 'pass', 'fail']),
        reference: z.string().nullable(),
        reason: z.string(),
      })
      .strict(),
    coordinateWarnings: z.array(z.string()),
  })
  .passthrough()
export const retainedTraverseSchema = z
  .object({
    receipt: traverseReceiptSchema,
    input: traverseCommandSchema,
    result: retainedTraverseResultSchema,
    currentReferenceMatches: z.boolean(),
  })
  .strict()
export type RetainedTraverse = z.infer<typeof retainedTraverseSchema>
export const traverseReadSchema = z
  .object({
    data: z
      .object({
        context: traverseContextSchema,
        revisions: z
          .array(
            z
              .object({
                revisionId: uuid,
                traverseId: uuid,
                ordinal: z.number().int().positive(),
                name: z.string(),
                createdAt: z.string(),
                status: z.literal('draft_unverified'),
              })
              .strict(),
          )
          .max(24),
        beforeOrdinal: z.number().int().positive().nullable(),
        nextBeforeOrdinal: z.number().int().positive().nullable(),
        hasMore: z.boolean(),
        selected: retainedTraverseSchema.nullable(),
      })
      .strict(),
  })
  .strict()

/** Preserve entry strings in the command; parse only for the numerical engine. */
export function computeRetainedTraverse(command: TraverseCommand) {
  const c = command.control,
    parse = parseTraverseDecimal
  if (assertProjectedCrs(command.sourceCrs).units !== 'metres')
    throw new Error(
      'The retained computation requires a projected metre reference.',
    )
  if (
    c.closing &&
    c.closing.station !==
      command.observations[command.observations.length - 1].station
  )
    throw new Error('The closing station must name the last observed target.')
  const result = computeTraverse({
    openingStation: c.openingStation,
    openingEasting: parse(c.openingEasting, 'Opening easting'),
    openingNorthing: parse(c.openingNorthing, 'Opening northing'),
    openingRL: c.openingRL.trim()
      ? parse(c.openingRL, 'Opening level')
      : undefined,
    closingStation: c.closing?.station,
    closingEasting: c.closing
      ? parse(c.closing.easting, 'Closing easting')
      : undefined,
    closingNorthing: c.closing
      ? parse(c.closing.northing, 'Closing northing')
      : undefined,
    backsightBearingDeg: parse(c.backsightDegrees, 'Backsight degrees'),
    backsightBearingMin: parse(c.backsightMinutes, 'Backsight minutes'),
    backsightBearingSec: parse(c.backsightSeconds, 'Backsight seconds'),
    observations: command.observations,
    horizontalScaleFactor: parse(
      command.reduction.combinedScaleFactor,
      'Combined scale factor',
    ),
    criterion: command.criterion
      ? {
          allowableMisclosureMm: parse(
            command.criterion.allowableMisclosureMm,
            'Criterion limit',
          ),
          reference: command.criterion.reference,
        }
      : undefined,
  })
  // Canonical JSON does not encode undefined. Preserve unknown levels as absent,
  // and null evidence as null, before hashing or storing a JSON snapshot.
  const warnings = new Set<string>()
  for (const [index, point] of result.coordinates.entries()) {
    const check = validateCoordinateRange(
      point.easting,
      point.northing,
      command.sourceCrs,
    )
    if (!check.valid)
      throw new Error(
        `Coordinate ${index + 1} is incompatible with the declared project grid. Review the original control and source reference.`,
      )
    check.warnings.forEach((warning) => warnings.add(warning))
  }
  return JSON.parse(
    JSON.stringify({ ...result, coordinateWarnings: [...warnings] }),
  ) as ReturnType<typeof computeTraverse> & { coordinateWarnings: string[] }
}
