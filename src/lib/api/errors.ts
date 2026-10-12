/**
 * Custom error classes for standardized API error handling across METARDU.
 *
 * These errors are recognized by apiHandler() and automatically mapped
 * to the correct HTTP status code and error response format.
 *
 * Usage:
 *   throw new NotFoundError('Parcel not found')
 *   throw new ConflictError('A traverse already exists for this parcel')
 *   throw new ValidationError('Invalid coordinates', { field: 'easting' })
 *   throw new AuthenticationError('Session expired')
 *   throw new AuthorizationError('Insufficient role')
 *   throw new RateLimitError('Too many requests')
 */

/**
 * Base application error. All API-domain errors should extend this class.
 * Includes a machine-readable `code` string for client-side error switching.
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: unknown

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.details = details

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * 401 — User is not authenticated or session has expired.
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details)
  }
}

/**
 * 403 — User is authenticated but lacks the required role/permission.
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details)
  }
}

/**
 * 404 — Requested resource was not found.
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details)
  }
}

/**
 * 409 — Conflict (e.g. duplicate unique key, optimistic lock failure).
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details)
  }
}

/**
 * 422 — Validation failed (e.g. Zod schema violation, business rule violation).
 * Use `details` to pass structured field-level errors.
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details)
  }
}

/**
 * 429 — Rate limit exceeded.
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: unknown) {
    super(message, 429, 'RATE_LIMITED', details)
  }
}

/**
 * 422 — Survey statutory tolerance breached or observation misclosure out of bounds.
 */
export class SurveyComputationError extends AppError {
  constructor(
    message: string,
    public readonly computationDetails: {
      statutoryClass?: string
      toleranceM?: number
      actualMisclosureM?: number
      angularToleranceSec?: number
      actualAngularMisclosureSec?: number
      affectedStations?: string[]
      remedy?: string
    }
  ) {
    super(message, 422, 'SURVEY_TOLERANCE_BREACH', computationDetails)
  }
}

/**
 * 422 — Least-squares normal equations matrix singularity or datum defect.
 */
export class SingularMatrixError extends AppError {
  constructor(
    message: string = 'Adjustment matrix is singular (rank deficient)',
    public readonly defectDetails?: {
      rankDeficit?: number
      unconstrainedNodes?: string[]
      remedy?: string
    }
  ) {
    super(message, 422, 'MATRIX_SINGULARITY', defectDetails)
  }
}

/**
 * 422 — Parcel geometry has degenerate topology (self-intersection, zero area, spikes).
 */
export class GeometricDegeneracyError extends AppError {
  constructor(
    message: string,
    public readonly geometryDetails?: {
      parcelId?: string
      location?: { easting: number; northing: number }
      remedy?: string
    }
  ) {
    super(message, 422, 'GEOMETRIC_DEGENERACY', geometryDetails)
  }
}

/**
 * 400 — Incompatible or uncalibrated datum between control and observations.
 */
export class DatumMismatchError extends AppError {
  constructor(
    message: string,
    public readonly datumDetails?: {
      expectedDatum?: string
      receivedDatum?: string
      remedy?: string
    }
  ) {
    super(message, 400, 'DATUM_MISMATCH', datumDetails)
  }
}

