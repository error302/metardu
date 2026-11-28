/** @jest-environment node */
import { normalizeMpesaPhoneNumber } from '../mpesa'
import { validateMpesaPaymentEvidence } from '../mpesaCompletion'

const CHECKOUT_REQUEST_ID = 'ws_CO_27112712000000001'

describe('M-Pesa completion evidence', () => {
  it('normalizes equivalent Kenyan phone formats at the provider boundary', () => {
    expect(normalizeMpesaPhoneNumber('0712345678')).toBe('254712345678')
    expect(normalizeMpesaPhoneNumber('+254 712 345 678')).toBe('254712345678')
    expect(normalizeMpesaPhoneNumber('254712345678')).toBe('254712345678')
    expect(normalizeMpesaPhoneNumber('0712 345 678')).toBe('254712345678')
  })

  it('rejects a phone number that is not a Kenyan mobile number', () => {
    expect(normalizeMpesaPhoneNumber('071234567')).toBeNull()
    expect(normalizeMpesaPhoneNumber('+12025550123')).toBeNull()
    expect(normalizeMpesaPhoneNumber('')).toBeNull()
  })

  it('accepts exact amount, phone, checkout, plan, and currency evidence', () => {
    expect(validateMpesaPaymentEvidence({
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '0712345678',
    }, {
      source: 'callback',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
      phone: '254712345678',
      receiptNumber: 'NLJ7RT61SV',
      resultCode: 0,
    })).toEqual({ ok: true })
  })

  it('rejects missing or mismatched paid amounts', () => {
    const expected = {
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }

    expect(validateMpesaPaymentEvidence(expected, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phone: '254712345678',
    })).toMatchObject({ ok: false, reason: 'missing_amount' })

    expect(validateMpesaPaymentEvidence(expected, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 1,
      phone: '254712345678',
    })).toMatchObject({ ok: false, reason: 'amount_mismatch' })
  })

  it('rejects a non-zero provider result code before completion', () => {
    expect(validateMpesaPaymentEvidence({
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
      phone: '254712345678',
      resultCode: 1032,
    })).toEqual({ ok: false, reason: 'non_zero_result_code' })
  })

  it('rejects missing or mismatched provider phones', () => {
    const expected = {
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }

    expect(validateMpesaPaymentEvidence(expected, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
    })).toMatchObject({ ok: false, reason: 'missing_phone' })

    expect(validateMpesaPaymentEvidence(expected, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
      phone: '254700000000',
    })).toMatchObject({ ok: false, reason: 'phone_mismatch' })
  })

  it('rejects evidence bound to a different checkout request', () => {
    expect(validateMpesaPaymentEvidence({
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }, {
      source: 'polling',
      checkoutRequestId: 'ws_CO_different',
      amount: 2500,
      phone: '254712345678',
    })).toMatchObject({ ok: false, reason: 'checkout_request_mismatch' })
  })

  it('requires a real Safaricom receipt for callback completion', () => {
    expect(validateMpesaPaymentEvidence({
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }, {
      source: 'callback',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
      phone: '254712345678',
    })).toMatchObject({ ok: false, reason: 'missing_receipt' })
  })

  it('does not default a missing plan to Pro', () => {
    expect(validateMpesaPaymentEvidence({
      planId: null,
      amount: 2500,
      currency: 'KES',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      phoneNumber: '254712345678',
    }, {
      source: 'polling',
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      amount: 2500,
      phone: '254712345678',
    })).toMatchObject({ ok: false, reason: 'missing_plan' })
  })
})
