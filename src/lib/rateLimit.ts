/**
 * ⚠️  DEPRECATED — DO NOT IMPORT FROM THIS FILE.
 *
 * The active rate limiter is at: @/lib/security/rateLimit
 * All routes and apiHandler already import from there.
 *
 * This file is kept to avoid breaking any legacy import that hasn't been
 * updated yet. It re-exports from the canonical location.
 */
export { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'

export const RATE_LIMITS = {
  mpesa:      { max: 3,  window: 60_000 },
  submission: { max: 5,  window: 3_600_000 },
  auth:       { max: 10, window: 900_000 },
  api:        { max: 30, window: 60_000 },
  upload:     { max: 10, window: 60_000 },
}

