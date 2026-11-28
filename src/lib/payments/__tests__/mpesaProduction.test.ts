/** @jest-environment node */
import { getMpesaService, MpesaService, MpesaPhoneNumberError, MpesaProviderError } from '@/lib/payments/mpesa'

jest.mock('@/lib/resilience/circuitBreaker', () => ({
  mpesaBreaker: { execute: (operation: () => Promise<unknown>) => operation() },
}))

describe('Daraja production collection configuration', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()

  function configuredService(): MpesaService {
    const service = getMpesaService()
    if (!service) throw new Error('Expected complete test configuration')
    return service
  }

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MPESA_ENV: 'production',
      MPESA_SHORT_CODE: '3104615',
      MPESA_TILL_NUMBER: '3370347',
      MPESA_CONSUMER_KEY: 'test-consumer-key',
      MPESA_CONSUMER_SECRET: 'test-consumer-secret',
      MPESA_PASSKEY: 'test-express-passkey',
    }
    fetchMock.mockReset()
    global.fetch = fetchMock
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  test.each(['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORT_CODE', 'MPESA_PASSKEY', 'MPESA_TILL_NUMBER'])(
    'keeps production checkout unavailable when %s is missing',
    name => {
      delete process.env[name]
      expect(getMpesaService()).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  test('rejects an unknown provider environment', () => {
    process.env.MPESA_ENV = 'prodution'
    expect(getMpesaService()).toBeNull()
  })

  test('allows sandbox configuration without a separate till', () => {
    process.env.MPESA_ENV = 'sandbox'
    delete process.env.MPESA_TILL_NUMBER
    expect(getMpesaService()).toBeInstanceOf(MpesaService)
  })

  test.each(['0712345678', '+254712345678', '254712345678', '0712 345 678'])(
    'sends the approved shortcode and receiving till separately for %s',
    async phoneNumber => {
      fetchMock
        .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
        .mockResolvedValueOnce(Response.json({ CheckoutRequestID: 'test-checkout', ResponseCode: '0' }))

      const service = configuredService()
      await service.initiateSTKPush({ phoneNumber, amount: 500, reference: 'METARDU-TEST', callbackUrl: 'https://metardu.space/api/payments/mpesa/callback' })

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials')
      const body = fetchMock.mock.calls[1]?.[1]?.body
      if (typeof body !== 'string') throw new Error('Expected JSON request body')
      const request = JSON.parse(body) as { Password: string; Timestamp: string }
      expect(request).toMatchObject({
        BusinessShortCode: '3104615', PartyB: '3370347',
        TransactionType: 'CustomerBuyGoodsOnline', PartyA: '254712345678', PhoneNumber: '254712345678',
      })
      expect(Buffer.from(request.Password, 'base64').toString()).toBe(`3104615test-express-passkey${request.Timestamp}`)
    },
  )

  test('rejects invalid phone input before contacting Safaricom', async () => {
    await expect(configuredService().initiateSTKPush({ phoneNumber: 'invalid', amount: 500, reference: 'TEST' })).rejects.toThrow('valid Kenyan mobile number')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('reports an invalid phone number as a client-correctable 400 error', async () => {
    await expect(
      configuredService().initiateSTKPush({ phoneNumber: 'invalid', amount: 500, reference: 'TEST' }),
    ).rejects.toBeInstanceOf(MpesaPhoneNumberError)

    await expect(
      configuredService().initiateSTKPush({ phoneNumber: 'invalid', amount: 500, reference: 'TEST' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MPESA_INVALID_PHONE' })
  })

  test('reports a provider invalid-phone rejection as an actionable 400 without leaking provider text', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ errorMessage: 'Bad Request - Invalid PhoneNumber' }, { status: 400 }))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaPhoneNumberError)
    await expect(request).rejects.toMatchObject({ statusCode: 400, code: 'MPESA_INVALID_PHONE' })
    await expect(request).rejects.toThrow(/registered for M-Pesa/i)
    await expect(request).rejects.not.toThrow(/Bad Request - Invalid PhoneNumber/)
  })

  test('reports an unexpected provider rejection as a safe 502 without leaking provider text', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ errorMessage: 'Daraja internal detail 99123' }, { status: 500 }))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    await expect(request).rejects.not.toThrow(/Daraja internal detail 99123/)
  })

  test('reports a non-JSON provider rejection as a safe 502 without leaking provider text', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(new Response('upstream-provider-detail', { status: 502 }))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    await expect(request).rejects.not.toThrow(/upstream-provider-detail/)
  })

  test('reports a malformed successful provider response as a safe 502', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(new Response('malformed-provider-success', { status: 200 }))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    await expect(request).rejects.not.toThrow(/malformed-provider-success/)
  })

  test('reports an STK network failure as a safe 502 without leaking provider text', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockRejectedValueOnce(new Error('network-provider-detail'))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    await expect(request).rejects.not.toThrow(/network-provider-detail/)
  })

  test('reports a Daraja authentication outage as a safe 502 without leaking the provider response', async () => {
    const response = new Response('sensitive-provider-response', { status: 401 })
    const rawBody = jest.spyOn(response, 'text')
    fetchMock.mockResolvedValueOnce(response)

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    await expect(request).rejects.not.toThrow(/sensitive-provider-response/)
    expect(rawBody).not.toHaveBeenCalled()
  })

  test('keeps ambiguous status queries pending', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ ResponseCode: '0' }))
    expect(await configuredService().checkTransactionStatus('test-checkout')).toMatchObject({ status: 'pending' })
  })

  test('classifies a known definitive STK query failure as failed', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ ResultCode: 1032, ResultDesc: 'Request cancelled by user' }))

    expect(await configuredService().checkTransactionStatus('test-checkout')).toMatchObject({
      status: 'failed',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    })
  })

  test.each([1001, 4999])('keeps unknown or retryable STK query result code %s pending', async resultCode => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ ResultCode: resultCode, ResultDesc: 'Synthetic ambiguous result' }))

    expect(await configuredService().checkTransactionStatus('test-checkout')).toMatchObject({
      status: 'pending',
      resultCode,
      resultDesc: 'Synthetic ambiguous result',
    })
  })

  test('rejects a refused STK response even when HTTP succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ ResponseCode: '1' }))
    await expect(configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })).rejects.toThrow('did not accept')
  })

  test('reports a refused STK response as a safe 502 provider error', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ ResponseCode: '1' }))

    const request = configuredService().initiateSTKPush({ phoneNumber: '0712345678', amount: 500, reference: 'TEST' })

    await expect(request).rejects.toBeInstanceOf(MpesaProviderError)
    await expect(request).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
  })

  test('excludes the raw authentication response from errors', async () => {
    const response = new Response('sensitive-provider-response', { status: 401 })
    const rawBody = jest.spyOn(response, 'text')
    fetchMock.mockResolvedValueOnce(response)
    await expect(configuredService().checkTransactionStatus('test-checkout')).rejects.toThrow('HTTP 401')
    expect(rawBody).not.toHaveBeenCalled()
  })
})
