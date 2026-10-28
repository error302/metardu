/** @jest-environment node */
import { NextRequest } from 'next/server'
import { feeQuoteInputSchema } from '../feeQuoteInput'
import { generateQuotePdf } from '../generateQuotePdf'
import { POST } from '@/app/api/tools/fee-quotation/pdf/route'

const valid = { category: 'topographic_survey', areaValue: 1, areaUnit: 'ha', resultantPlots: 0, beaconsToSet: 0, distanceKm: 0, currency: 'KES', includeVat: false } as const

test.each([true, [], {}, '1', '0x10', NaN, Infinity, -1])('refuses non-finite or coerced quotation area: %p', areaValue => {
  expect(feeQuoteInputSchema.safeParse({ ...valid, areaValue }).success).toBe(false)
})
test('retains declared numeric zero and optional metadata without fabrication', () => {
  expect(feeQuoteInputSchema.parse(valid)).toEqual(valid)
})
test('refuses unsupported categories, currencies and non-text identities', () => {
  for (const change of [{ category: 'unknown' }, { currency: 'unknown' }, { clientName: true }, { includeVat: 'false' }, { resultantPlots: 1.5 }]) expect(feeQuoteInputSchema.safeParse({ ...valid, ...change }).success).toBe(false)
})
test('generates an actual PDF through the installed table plugin', () => {
  const bytes = generateQuotePdf(feeQuoteInputSchema.parse(valid))
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(1000)
})
test('invalid public input returns 400 before PDF calculation', async () => {
  const request = new NextRequest('http://127.0.0.1/api/tools/fee-quotation/pdf', { method: 'POST', body: JSON.stringify({ ...valid, areaValue: true }) })
  const response = await POST(request)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: 'Invalid quotation input' })
})
