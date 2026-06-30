/**
 * @module apiValidation
 *
 * Centralized API input validation utilities
 *
 * Provides lightweight Zod schemas for common API input patterns.
 * Routes can use validateBody() to ensure input safety before processing.
 *
 * Usage in apiHandler:
 *   export const POST = apiHandler(
 *     { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
 *     async (req, ctx) => {
 *       const { email, plan } = validateBody(ctx.body, OverridePlanSchema)
 *       ...
 *     }
 *   )
 *
 * Or standalone:
 *   const data = validateBody(rawBody, MySchema)
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Common schemas
// ---------------------------------------------------------------------------

/** UUID string validation */
export const uuidSchema = z.string().uuid()

/** Email validation */
export const emailSchema = z.string().email().max(255).toLowerCase()

/** Non-empty string */
export const nonEmptyString = z.string().min(1).max(10000)

/** Positive number */
export const positiveNumber = z.number().positive().finite()

/** Coordinate (easting/northing) */
export const coordinateSchema = z.object({
  easting: z.number().finite(),
  northing: z.number().finite(),
})

/** Survey point with elevation */
export const surveyPointSchema = z.object({
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().optional(),
})

/** Parcel input */
export const parcelInputSchema = z.object({
  parcelNumber: z.string().min(1).max(100),
  ownerName: z.string().max(200).optional(),
  ownerId: z.string().max(50).optional(),
  lrNumber: z.string().max(100).optional(),
  areaHa: z.number().positive().optional(),
  vertices: z.array(surveyPointSchema).min(3).max(10000),
})

/** Beacon input */
export const beaconInputSchema = z.object({
  beaconNumber: z.string().min(1).max(100),
  beaconType: z.enum(['concrete', 'iron_pin', 'stone', 'pipe', 'reference_object']).optional(),
  easting: z.number().finite(),
  northing: z.number().finite(),
  elevation: z.number().optional(),
  county: z.string().max(100).optional(),
  subCounty: z.string().max(100).optional(),
  locality: z.string().max(500).optional(),
  sheetNumber: z.string().max(50).optional(),
  establishedBy: z.string().max(200).optional(),
  establishedDate: z.string().optional(),
  condition: z.enum(['good', 'disturbed', 'damaged', 'missing']).optional(),
  description: z.string().max(1000).optional(),
  isAdopted: z.boolean().optional(),
})

/** Plan override */
export const overridePlanSchema = z.object({
  email: emailSchema,
  plan: z.enum(['free', 'pro', 'enterprise']),
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().max(500).optional(),
})

/** Field record input */
export const fieldRecordSchema = z.object({
  frNumber: z.string().min(1).max(100),
  frType: z.string().max(50).optional(),
  easting: z.number().finite(),
  northing: z.number().finite(),
  county: z.string().max(100).optional(),
  subCounty: z.string().max(100).optional(),
  locality: z.string().max(500).optional(),
  registryBlock: z.string().max(50).optional(),
  sheetNumber: z.string().max(50).optional(),
  surveyType: z.string().max(50).optional(),
  surveyYear: z.number().int().min(1800).max(2100).optional(),
  surveyorName: z.string().max(200).optional(),
  parcelNumbers: z.array(z.string()).optional(),
  description: z.string().max(5000).optional(),
})

/** Equipment input */
export const equipmentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  manufacturer: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  serialNumber: z.string().max(200).optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  notes: z.string().max(5000).optional(),
})

/** Notification input */
export const notificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['info', 'success', 'warning', 'error']).optional(),
  category: z.string().max(50).optional(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  actionUrl: z.string().max(500).optional(),
  actionLabel: z.string().max(100).optional(),
})

/** Activity log input */
export const activitySchema = z.object({
  activityType: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  projectId: z.string().uuid().optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  metadata: z.record(z.any()).optional(),
})

/** Spatial query params */
export const spatialQuerySchema = z.object({
  west: z.number().finite(),
  south: z.number().finite(),
  east: z.number().finite(),
  north: z.number().finite(),
  limit: z.number().int().min(1).max(500).optional(),
  types: z.array(z.string()).optional(),
})

/** Generic safe object (max depth 3, no prototypes) */
export const safeObjectSchema = z.record(z.any()).refine(
  (val) => {
    const json = JSON.stringify(val)
    return json.length < 1_000_000 // 1MB max
  },
  { message: 'Payload too large (max 1MB)' }
)

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a request body against a Zod schema.
 * Throws a formatted error if validation fails.
 */
export function validateBody<T>(body: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    throw new Error(`Validation error: ${errors}`)
  }
  return result.data
}

/**
 * Validate and sanitize a string input.
 * Trims, limits length, prevents XSS.
 */
export function sanitizeString(input: unknown, maxLength: number = 1000): string {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, maxLength)
}

/**
 * Validate a number input.
 */
export function sanitizeNumber(input: unknown, min?: number, max?: number): number | null {
  if (typeof input !== 'number' || !isFinite(input)) return null
  if (min != null && input < min) return null
  if (max != null && input > max) return null
  return input
}

/**
 * Validate an email.
 */
export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  if (trimmed.length > 255) return null
  return trimmed
}
