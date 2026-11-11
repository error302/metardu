import { computeSurveyFee, type FeeQuoteInput } from '../surveyFeeCalculator'

const base: FeeQuoteInput = {
  category: 'boundary_reestablishment',
  areaValue: 1,
  areaUnit: 'ha',
  resultantPlots: 0,
  beaconsToSet: 0,
  distanceKm: 0,
  currency: 'KES',
  includeVat: false,
}

const areaItem = (input: Partial<FeeQuoteInput>) => {
  const item = computeSurveyFee({ ...base, ...input }).items.find((entry) => entry.id === 'area_rate')
  if (!item) throw new Error('area_rate line item missing from the quote')
  return item
}

describe('computeSurveyFee acreage line item', () => {
  it('keeps quantity x rate equal to the amount on every printed line', () => {
    for (const areaHa of [0.25, 0.5, 0.9, 1, 3, 8, 25]) {
      const item = areaItem({ areaValue: areaHa })
      expect(item.amount).toBeCloseTo(item.quantity * item.rate, 6)
    }
  })

  it('bills the 1 Ha minimum as 1 Ha rather than a fractional quantity', () => {
    const item = areaItem({ areaValue: 0.25 })
    expect(item.quantity).toBe(1)
    expect(item.amount).toBe(6000)
    expect(item.description).toMatch(/1\.00 Ha minimum billing applies/)
  })

  it('bills the true area once it exceeds the minimum', () => {
    const item = areaItem({ areaValue: 3 })
    expect(item.quantity).toBe(3)
    expect(item.amount).toBe(18000)
    expect(item.description).not.toMatch(/minimum billing applies/)
  })

  it('still applies the sliding scale rate tiers', () => {
    expect(areaItem({ areaValue: 8 }).rate).toBe(4500)
    expect(areaItem({ areaValue: 25 }).rate).toBe(3000)
  })
})

describe('computeSurveyFee totals', () => {
  it('keeps the milestone schedule summing to the quoted total', () => {
    for (const areaValue of [0.3, 1.1, 4.9, 12.3, 33.33]) {
      const quote = computeSurveyFee({
        ...base,
        category: 'cadastral_subdivision',
        areaValue,
        resultantPlots: 3,
        beaconsToSet: 4,
        distanceKm: 37,
        includeVat: true,
        customMarkupPercent: 7,
      })
      const sum = quote.milestones.reduce((total, milestone) => total + milestone.amount, 0)
      expect(sum).toBeCloseTo(quote.totalAmount, 6)
      expect(quote.milestones.map((m) => m.percentage)).toEqual([50, 30, 20])
    }
  })

  it('applies 16% VAT only when requested', () => {
    const withoutVat = computeSurveyFee(base)
    const withVat = computeSurveyFee({ ...base, includeVat: true })
    expect(withoutVat.vatAmount).toBe(0)
    expect(withVat.vatAmount).toBeCloseTo(withoutVat.subtotal * 0.16, 6)
    expect(withVat.totalAmount).toBeCloseTo(withVat.subtotal + withVat.vatAmount, 6)
  })
})
