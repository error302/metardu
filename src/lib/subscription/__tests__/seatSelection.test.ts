import { getTotalPrice } from '@/lib/subscription/catalog'
import { MAX_SELF_SERVE_SEATS, resolveSeatSelection, seatCountFromPaymentMetadata } from '@/lib/subscription/seatSelection'

describe('subscription seat selection', () => {
  test('uses included seats when no quantity is supplied and prices extra seats from the catalog', () => {
    expect(resolveSeatSelection('team', undefined)).toEqual({ ok: true, totalSeats: 3, extraSeats: 0 })

    const selection = resolveSeatSelection('team', 4)
    expect(selection).toEqual({ ok: true, totalSeats: 4, extraSeats: 1 })
    expect(getTotalPrice('team', 'KES', selection.ok ? selection.totalSeats : 0)).toBe(6000)
  })

  test('rejects below-included, fractional, non-per-seat, and over-limit quantities', () => {
    expect(resolveSeatSelection('firm', 4).ok).toBe(false)
    expect(resolveSeatSelection('team', 3.5).ok).toBe(false)
    expect(resolveSeatSelection('pro', 2).ok).toBe(false)
    expect(resolveSeatSelection('team', MAX_SELF_SERVE_SEATS + 1).ok).toBe(false)
  })

  test('recovers the purchased quantity from payment metadata and defaults legacy rows safely', () => {
    expect(seatCountFromPaymentMetadata('firm', { seatCount: 7, extraSeats: 2 })).toBe(7)
    expect(seatCountFromPaymentMetadata('team', null)).toBe(3)
    expect(seatCountFromPaymentMetadata('team', { seatCount: 1_000_000 })).toBe(3)
  })
})
