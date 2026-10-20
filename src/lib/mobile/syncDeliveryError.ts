/** Preserve transport instructions without adding them to raw survey records. */
export class SyncDeliveryError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfter?: string | null) {
    super(message)
    this.name = 'SyncDeliveryError'
  }
}

export function syncDeliveryError(error: unknown): SyncDeliveryError {
  if (error instanceof SyncDeliveryError) return error
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown; retryAfter?: unknown }
    const status = typeof value.code === 'string' && /^[45]\d{2}$/.test(value.code) ? Number(value.code) : undefined
    return new SyncDeliveryError(typeof value.message === 'string' ? value.message : 'Delivery failed. The device copy was retained.',
      status, typeof value.retryAfter === 'string' ? value.retryAfter : undefined)
  }
  return new SyncDeliveryError('Delivery failed. The device copy was retained.')
}
