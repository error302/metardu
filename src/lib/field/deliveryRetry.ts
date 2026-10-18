export interface FieldDeliveryRetry {
  attempts: number
  nextAttemptAt: number
  blocked: boolean
  httpStatus?: number
}

/** Delivery metadata is separate from the immutable observation payload. */
export function fieldDeliveryFailure(previous: FieldDeliveryRetry | undefined, status?: number, retryAfter?: string | null): FieldDeliveryRetry {
  const attempts = Math.min((previous?.attempts ?? 0) + 1, 10)
  const now = Date.now()
  const blocked = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429
  const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN
  const requestedDelay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - now : 0
  // Bounded exponential retries avoid a failing record consuming the whole queue.
  const delay = Math.max(Math.min(30000 * 2 ** (attempts - 1),15 * 60000), Number.isFinite(requestedDelay) ? requestedDelay : 0)
  return { attempts, nextAttemptAt: now + delay, blocked, ...(status === undefined ? {} : { httpStatus: status }) }
}

export function mayRetryFieldDelivery(retry: FieldDeliveryRetry | undefined, explicitRetry: boolean): boolean {
  if (!retry) return true
  // Do not bypass a server throttling window even when the operator clicks retry.
  if (retry.httpStatus === 429 && retry.nextAttemptAt > Date.now()) return false
  return explicitRetry || (!retry.blocked && retry.nextAttemptAt <= Date.now())
}
