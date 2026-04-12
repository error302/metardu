/**
 * In-memory rate limiter (sufficient for single GCP VM).
 * For multi-instance, replace with Redis-based solution.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  rateLimitMap.forEach((record, key) => {
    if (now > record.resetAt) rateLimitMap.delete(key)
  })
}, 10 * 60 * 1000).unref()

export function rateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const record = rateLimitMap.get(key)
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, retryAfterMs: record.resetAt - now }
  }
  
  record.count++
  return { allowed: true, retryAfterMs: 0 }
}

export const RATE_LIMITS = {
  mpesa: { max: 3, window: 60_000 },
  submission: { max: 5, window: 3_600_000 },
  auth: { max: 10, window: 900_000 },
  api: { max: 30, window: 60_000 },
  upload: { max: 10, window: 60_000 },
}
