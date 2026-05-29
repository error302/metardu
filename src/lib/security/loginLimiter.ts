/**
 * Login Brute-Force Protection for METARDU
 *
 * Tracks failed login attempts per email+IP combination.
 * After MAX_FAILED_ATTEMPTS failures within the LOCKOUT_WINDOW,
 * the account is temporarily locked out.
 *
 * Uses in-memory storage (suitable for single-VM deployment).
 * For multi-instance, migrate to Redis/Upstash.
 */

interface LoginAttempt {
  count: number
  firstAttemptAt: number
  lockedUntil: number | null
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000   // 15 minutes — count failures within this window
const LOCKOUT_DURATION_MS = 30 * 60 * 1000  // 30 minutes — how long the lockout lasts

// In-memory store: key = "email:ip", value = attempt record
const attemptStore = new Map<string, LoginAttempt>()

// Periodic cleanup of expired entries (every 10 minutes)
setInterval(() => {
  const now = Date.now()
  const keysToDelete: string[] = []
  attemptStore.forEach((record, key) => {
    // Remove if: lockout expired AND window expired
    const lockoutExpired = !record.lockedUntil || record.lockedUntil < now
    const windowExpired = record.firstAttemptAt + LOCKOUT_WINDOW_MS < now
    if (lockoutExpired && windowExpired) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => attemptStore.delete(key))
}, 10 * 60 * 1000)

function getKey(email: string, ip: string): string {
  return `${email.toLowerCase()}:${ip}`
}

/**
 * Check if a login attempt is allowed.
 * Returns { allowed, reason } — if not allowed, reason explains why.
 */
export function checkLoginAllowed(email: string, ip: string): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const key = getKey(email, ip)
  const record = attemptStore.get(key)

  if (!record) return { allowed: true }

  const now = Date.now()

  // Check if locked out
  if (record.lockedUntil && record.lockedUntil > now) {
    const retryAfterMs = record.lockedUntil - now
    return {
      allowed: false,
      reason: `Account temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`,
      retryAfterMs,
    }
  }

  // Check if the failure window has expired — if so, reset
  if (record.firstAttemptAt + LOCKOUT_WINDOW_MS < now) {
    attemptStore.delete(key)
    return { allowed: true }
  }

  return { allowed: true }
}

/**
 * Record a failed login attempt.
 * After MAX_FAILED_ATTEMPTS, triggers a lockout.
 */
export function recordFailedLogin(email: string, ip: string): void {
  const key = getKey(email, ip)
  const now = Date.now()
  const record = attemptStore.get(key)

  if (!record || record.firstAttemptAt + LOCKOUT_WINDOW_MS < now) {
    // Fresh window
    attemptStore.set(key, { count: 1, firstAttemptAt: now, lockedUntil: null })
    return
  }

  record.count += 1

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS
    console.warn(`[loginLimiter] Account locked: ${email} from ${ip} after ${record.count} failed attempts. Locked for ${LOCKOUT_DURATION_MS / 60000} minutes.`)
  }
}

/**
 * Record a successful login — clears the failure count.
 */
export function recordSuccessfulLogin(email: string, ip: string): void {
  const key = getKey(email, ip)
  attemptStore.delete(key)
}

/**
 * Get the current failure count for an email+IP (useful for warnings).
 */
export function getFailedAttemptCount(email: string, ip: string): number {
  const key = getKey(email, ip)
  const record = attemptStore.get(key)
  if (!record) return 0
  if (record.firstAttemptAt + LOCKOUT_WINDOW_MS < Date.now()) return 0
  return record.count
}
