/** @jest-environment node */
import { NextRequest } from 'next/server'
import { mr } from '@/test-utils/mock-rows'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { getMpesaService } from '@/lib/payments/mpesa'
import { POST } from '../route'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentRlsServiceRole: jest.fn() }))
jest.mock('@/lib/payments/mpesa', () => ({ getMpesaService: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

const originalKey = process.env.API_ADMIN_KEY
const key = 'synthetic-reconciliation-route-test-only'
const check = jest.fn()
const query = jest.mocked(db.query)
const request = (authorized = true) => new NextRequest('http://127.0.0.1/api/cron/reconcile-mpesa', {
  method: 'POST', headers: authorized ? { authorization: `Bearer ${key}` } : {},
})
beforeEach(() => {
  jest.clearAllMocks()
  process.env.API_ADMIN_KEY = key
  jest.mocked(getMpesaService).mockReturnValue({ checkTransactionStatus: check } as unknown as NonNullable<ReturnType<typeof getMpesaService>>)
})
afterAll(() => {
  if (originalKey === undefined) delete process.env.API_ADMIN_KEY
  else process.env.API_ADMIN_KEY = originalKey
})

test('unauthorized reconciliation cannot inspect payments or call the provider', async () => {
  expect((await POST(request(false))).status).toBe(401)
  expect(query).not.toHaveBeenCalled()
  expect(setCurrentRlsServiceRole).not.toHaveBeenCalled()
  expect(check).not.toHaveBeenCalled()
})

test.each([null, ''])('missing transaction identity %p remains pending without a provider call or entitlement write', async transactionId => {
  query.mockResolvedValueOnce(mr([{ id: 'synthetic-payment', transaction_id: transactionId }]))
    .mockResolvedValueOnce(mr([{ old: false }]))
  const response = await POST(request())
  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(setCurrentRlsServiceRole).toHaveBeenCalledWith('billing_reconciliation')
  expect(check).not.toHaveBeenCalled()
  expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true)
})

test('a retained transaction identity reaches the provider and ambiguous evidence remains pending', async () => {
  query.mockResolvedValueOnce(mr([{ id: 'synthetic-payment', transaction_id: 'synthetic-checkout' }]))
    .mockResolvedValueOnce(mr([{ old: false }]))
  check.mockResolvedValueOnce({ status: 'pending' })
  const response = await POST(request())
  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(check).toHaveBeenCalledWith('synthetic-checkout')
  expect(query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true)
})
