/**
 * M-Pesa Mobile Money Integration
 * Supports Kenya M-Pesa, Uganda Airtel Money, Tanzania M-Pesa
 */

import { mpesaBreaker } from '@/lib/resilience/circuitBreaker'
import { AppError } from '@/lib/api/errors'

/**
 * 400 — the customer can correct the M-Pesa phone number and retry.
 * The message is deliberately customer-safe and never contains raw provider text.
 */
export class MpesaPhoneNumberError extends AppError {
  constructor(
    message = 'Enter a valid Kenyan mobile number, such as 0712345678 or +254712345678.',
  ) {
    super(message, 400, 'MPESA_INVALID_PHONE')
  }
}

/**
 * 502 — Daraja could not accept the request for a reason the customer cannot fix.
 * Provider payloads are never returned to the browser.
 */
export class MpesaProviderError extends AppError {
  constructor(
    message = 'M-Pesa could not accept this payment request. Please try again or choose another payment method.',
    cause?: unknown,
  ) {
    super(message, 502, 'MPESA_UNAVAILABLE')
    if (cause !== undefined) this.cause = cause
  }
}

export interface MpesaConfig {
  consumerKey: string
  consumerSecret: string
  shortCode: string
  tillNumber?: string
  initiatorName: string
  securityCredential: string
  environment: 'sandbox' | 'production'
}

export interface STKPushParams {
  phoneNumber: string
  amount: number
  reference: string
  description?: string
  callbackUrl?: string
}

export interface MpesaTransaction {
  transactionId: string
  amount: number
  phone: string
  reference: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: string
}

// ─── Daraja / Airtel API response shapes ───────────────────────────────────
interface DarajaTokenResponse {
  access_token: string
}

interface DarajaErrorResponse {
  errorMessage?: string
}

interface StkPushResponse {
  CheckoutRequestID: string
  ResponseCode: string
}

interface StkQueryResponse {
  ResultCode?: number
  Amount?: string
  PhoneNumber?: string
  ResultDesc?: string
}

interface AirtelPaymentResponse {
  data?: { transaction?: { id?: string } }
  message?: string
}

export class MpesaService {
  private consumerKey: string
  private consumerSecret: string
  private shortCode: string
  private tillNumber: string
  private initiatorName: string
  private securityCredential: string
  private environment: 'sandbox' | 'production'

  constructor(config: MpesaConfig) {
    this.consumerKey = config.consumerKey
    this.consumerSecret = config.consumerSecret
    this.shortCode = config.shortCode
    this.tillNumber = config.tillNumber || config.shortCode
    this.initiatorName = config.initiatorName
    this.securityCredential = config.securityCredential
    this.environment = config.environment
  }

  private get baseUrl(): string {
    return this.environment === 'sandbox'
      ? 'https://sandbox.safaricom.co.ke'
      : 'https://api.safaricom.co.ke'
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64')

    const response = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    })

    if (!response.ok) {
      // AUDIT FIX (M15, 2026-07-02): Actionable error message.
      throw new Error(
        'Could not obtain M-Pesa access token from Safaricom Daraja API. ' +
        'Check: (1) MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are set correctly, ' +
        '(2) MPESA_ENV is "sandbox" or "production" and matches your credentials, ' +
        '(3) Safaricom Daraja API is reachable (check network/firewall). ' +
        `HTTP ${response.status}.`
      )
    }

    const data = (await response.json()) as DarajaTokenResponse
    return data.access_token
  }

  async initiateSTKPush(params: STKPushParams): Promise<{ checkoutRequestId: string; responseCode: string }> {
    const phoneNumber = params.phoneNumber.trim().replace(/[\s()-]/g, '').replace(/^\+/, '').replace(/^0/, '254')
    if (!/^254[17]\d{8}$/.test(phoneNumber)) {
      throw new MpesaPhoneNumberError()
    }
    let accessToken: string
    try {
      accessToken = await this.getAccessToken()
    } catch (cause) {
      throw new MpesaProviderError(
        'M-Pesa is temporarily unavailable. Please try again or choose another payment method.',
        cause,
      )
    }

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const password = Buffer.from(`${this.shortCode}${process.env.MPESA_PASSKEY || ''}${timestamp}`).toString('base64')

    let response: Response
    try {
      response = await mpesaBreaker.execute(() => fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          BusinessShortCode: this.shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerBuyGoodsOnline',
          Amount: Math.round(params.amount),
          PartyA: phoneNumber,
          PartyB: this.tillNumber,
          PhoneNumber: phoneNumber,
          CallBackURL: params.callbackUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa/callback`,
          AccountReference: params.reference,
          TransactionDesc: params.description || 'METARDU Payment'
        })
      }))
    } catch (cause) {
      throw new MpesaProviderError(
        'M-Pesa is temporarily unavailable. Please try again or choose another payment method.',
        cause,
      )
    }

    if (!response.ok) {
      let providerMessage = ''
      try {
        const error = await response.json() as unknown
        if (error && typeof error === 'object' && typeof (error as DarajaErrorResponse).errorMessage === 'string') {
          providerMessage = (error as DarajaErrorResponse).errorMessage as string
        }
      } catch {
        throw new MpesaProviderError()
      }
      // Customer-safe translation of Daraja failures. Raw provider payloads are
      // never returned to the browser.
      if (providerMessage === 'DS090.301.BF00002' || /invalid\s*phone\s*number/i.test(providerMessage)) {
        throw new MpesaPhoneNumberError(
          'This M-Pesa number is not valid or not registered for M-Pesa. Use a Kenyan mobile number registered for M-Pesa.',
        )
      }
      if (providerMessage === 'DS090.301.BF00003') {
        throw new MpesaProviderError('There is not enough M-Pesa balance for this payment.')
      }
      if (providerMessage === 'DS090.301.BF00004') {
        throw new MpesaProviderError('The M-Pesa payment request was cancelled.')
      }
      if (providerMessage === 'DS090.301.BF00005') {
        throw new MpesaProviderError('The M-Pesa payment request timed out. Please try again.')
      }
      throw new MpesaProviderError()
    }

    let data: StkPushResponse
    try {
      const parsed = await response.json() as unknown
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid M-Pesa response')
      data = parsed as StkPushResponse
    } catch {
      throw new MpesaProviderError()
    }
    if (data.ResponseCode !== '0' || !data.CheckoutRequestID) {
      throw new MpesaProviderError(
        'M-Pesa did not accept the payment request. Please try again or choose another payment method.',
      )
    }
    return {
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode
    }
  }

  async checkTransactionStatus(checkoutRequestId: string): Promise<{ status: string; amount?: number; phone?: string; resultCode?: number; resultDesc?: string }> {
    const accessToken = await this.getAccessToken()

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
    const password = Buffer.from(`${this.shortCode}${process.env.MPESA_PASSKEY || ''}${timestamp}`).toString('base64')

    const response = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      })
    })

    if (!response.ok) {
      // AUDIT FIX (CRITICAL 2, 2026-07-02): Actionable error message.
      throw new Error(
        `Failed to check M-Pesa transaction status (HTTP ${response.status}). ` +
        `Check MPESA_CONSUMER_KEY/SECRET and MPESA_PASSKEY are correct.`
      )
    }

    const data = (await response.json()) as StkQueryResponse
    // AUDIT FIX (CRITICAL 2, 2026-07-02): Check ResultCode, not ResponseCode.
    // ResponseCode === '0' means the *query API call* succeeded — it does NOT
    // mean the payment was completed. The actual payment status is in
    // ResultCode: 0 = success, anything else = failure.
    // Reference: Safaricom Daraja API docs — STK Push Query
    return {
      status: typeof data.ResultCode !== 'number' ? 'pending' : data.ResultCode === 0 ? 'completed' : 'failed',
      amount: data.Amount ? parseFloat(data.Amount) : undefined,
      phone: data.PhoneNumber,
      resultCode: data.ResultCode,
      resultDesc: data.ResultDesc,
    }
  }

  async registerC2BUrls(): Promise<boolean> {
    const accessToken = await this.getAccessToken()

    const response = await fetch(`${this.baseUrl}/mpesa/c2b/v1/registerurl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ShortCode: this.shortCode,
        ResponseType: 'Completed',
        ConfirmationURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa/c2b/confirm`,
        ValidationURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa/c2b/validate`
      })
    })

    return response.ok
  }

  parseCallback(payload: Record<string, unknown>): MpesaTransaction | null {
    const body = payload.Body as { stkCallback?: { ResultCode: number; CallbackMetadata?: { Item: { Name: string; Value: string | number }[] } } }
    
    if (!body?.stkCallback?.CallbackMetadata) return null

    const items = body.stkCallback.CallbackMetadata.Item
    const getValue = (name: string): string | number | undefined =>
      items.find((i) => i.Name === name)?.Value

    return {
      transactionId: String(getValue('MpesaReceiptNumber') || ''),
      amount: Number(getValue('Amount')) || 0,
      phone: String(getValue('PhoneNumber') || ''),
      reference: String(getValue('AccountReference') || ''),
      status: body.stkCallback.ResultCode === 0 ? 'completed' : 'failed',
      timestamp: new Date().toISOString()
    }
  }
}

export class AirtelMoneyService {
  private clientId: string
  private clientSecret: string
  private environment: 'sandbox' | 'production'

  constructor(clientId: string, clientSecret: string, environment: 'sandbox' | 'production' = 'sandbox') {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.environment = environment
  }

  private get baseUrl(): string {
    return this.environment === 'sandbox'
      ? 'https://api.sandbox.airtel.africa'
      : 'https://api.airtel.africa'
  }

  async initiatePayment(phone: string, amount: number, reference: string): Promise<{ transactionId: string }> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')

    const response = await fetch(`${this.baseUrl}/merchant/v1/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials}`,
        'Content-Type': 'application/json',
        'X-Country': 'UGA',
        'X-Currency': 'UGX'
      },
      body: JSON.stringify({
        reference,
        subscriber: {
          country: 'UG',
          msisdn: phone.replace(/^256/, '')
        },
        transaction: {
          amount,
          currency: 'UGX',
          description: 'METARDU Payment'
        }
      })
    })

    if (!response.ok) {
      const error = (await response.json()) as AirtelPaymentResponse
      throw new Error(error.message || 'Airtel payment failed')
    }

    const data = (await response.json()) as AirtelPaymentResponse
    return {
      transactionId: data.data?.transaction?.id || ''
    }
  }
}

export function getMpesaService(): MpesaService | null {
  const consumerKey = process.env.MPESA_CONSUMER_KEY
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET
  const shortCode = process.env.MPESA_SHORT_CODE
  const passkey = process.env.MPESA_PASSKEY
  const environment = process.env.MPESA_ENV || 'sandbox'
  const tillNumber = process.env.MPESA_TILL_NUMBER

  if (!consumerKey || !consumerSecret || !shortCode || !passkey) return null
  if (environment !== 'sandbox' && environment !== 'production') return null
  if (environment === 'production' && !tillNumber) return null

  // AUDIT FIX (HIGH 10, 2026-07-02): Use MPESA_ENV, not NODE_ENV.
  // NODE_ENV=production does NOT mean M-Pesa is in production mode —
  // the app can run in production with M-Pesa still in sandbox for testing.
  // MPESA_ENV explicitly controls the M-Pesa environment.
  return new MpesaService({
    consumerKey,
    consumerSecret,
    shortCode,
    tillNumber,
    initiatorName: process.env.MPESA_INITIATOR_NAME || '',
    securityCredential: process.env.MPESA_SECURITY_CREDENTIAL || '',
    environment
  })
}
