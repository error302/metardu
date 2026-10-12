import { getPlan } from '@/lib/subscription/catalog'

/** Larger crews should use a negotiated Enterprise plan. */
export const MAX_SELF_SERVE_SEATS = 250

export type SeatSelectionResult =
  | { ok: true; totalSeats: number; extraSeats: number }
  | { ok: false; error: string }

/** Validate a total-seat choice against the public plan catalog. */
export function resolveSeatSelection(planId: string, requested: unknown): SeatSelectionResult {
  const plan = getPlan(planId)
  if (!plan || plan.contactSales) return { ok: false, error: 'This plan is not available through self-serve checkout.' }

  const totalSeats = requested === undefined ? plan.includedSeats : requested
  if (typeof totalSeats !== 'number' || !Number.isSafeInteger(totalSeats) || totalSeats < 1) {
    return { ok: false, error: 'Choose a valid number of seats.' }
  }
  if (totalSeats > MAX_SELF_SERVE_SEATS) {
    return { ok: false, error: `Self-serve checkout supports up to ${MAX_SELF_SERVE_SEATS} seats. Contact METARDU for larger teams.` }
  }
  if (totalSeats < plan.includedSeats) {
    return { ok: false, error: `${plan.name} includes ${plan.includedSeats} seats.` }
  }
  if (!plan.isPerSeat && totalSeats !== plan.includedSeats) {
    return { ok: false, error: `${plan.name} does not support additional seats.` }
  }

  return {
    ok: true,
    totalSeats,
    extraSeats: plan.isPerSeat ? totalSeats - plan.includedSeats : 0,
  }
}

/** Read trusted seat metadata from a payment record, defaulting legacy payments safely. */
export function seatCountFromPaymentMetadata(planId: string, metadata: unknown): number {
  const plan = getPlan(planId)
  if (!plan || plan.contactSales) return 1

  let record: Record<string, unknown> | null = null
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    record = metadata as Record<string, unknown>
  } else if (typeof metadata === 'string') {
    try {
      const parsed: unknown = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>
      }
    } catch {
      // Legacy or malformed rows fall back to the included seat count.
    }
  }

  const selection = resolveSeatSelection(planId, record?.seatCount)
  return selection.ok ? selection.totalSeats : plan.includedSeats
}
