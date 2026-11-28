/** @jest-environment node */
import db, { setRlsContext } from '@/lib/db'
import { completeMpesaPayment } from '../mpesaCompletion'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getClient: jest.fn(),
  },
  setRlsContext: jest.fn().mockResolvedValue(undefined),
}))

const PAYMENT_ID = '90000000-0000-4000-8000-000000000101'
const USER_ID = '90000000-0000-4000-8000-000000000102'
const CHECKOUT_REQUEST_ID = 'ws_CO_27112712000000101'

const record = {
  id: PAYMENT_ID,
  user_id: USER_ID,
  plan_id: 'team',
  amount: 6000,
  currency: 'KES',
  status: 'pending',
  checkout_request_id: CHECKOUT_REQUEST_ID,
  phone_number: '254712345678',
  metadata: { seatCount: 4, extraSeats: 1 },
}

const evidence = {
  source: 'callback' as const,
  checkoutRequestId: CHECKOUT_REQUEST_ID,
  amount: 6000,
  phone: '254712345678',
  receiptNumber: 'NLJ7RT61SV',
  resultCode: 0,
}

function transactionClient(options: {
  claimRowCount?: number
  receiptEnrichmentRowCount?: number
  existingSubscription?: boolean
  storedStatus?: string | null
  storedCheckoutRequestId?: string | null
  storedTransactionId?: string | null
} = {}) {
  const query = jest.fn<Promise<{
    rows: unknown[]
    rowCount: number
    command: string
    oid: number
    fields: unknown[]
  }>, [string, unknown[]?]>(async (sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0, command: sql, oid: 0, fields: [] }
    }
    if (
      sql.includes('SELECT') &&
      sql.includes('FROM payment_history') &&
      sql.includes('FOR UPDATE')
    ) {
      return {
        rows: [{
          status: options.storedStatus ?? 'completed',
          checkout_request_id: options.storedCheckoutRequestId ?? CHECKOUT_REQUEST_ID,
          transaction_id: options.storedTransactionId ?? null,
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      }
    }
    if (
      sql.includes('UPDATE payment_history') &&
      sql.includes("status IN ('pending', 'processing', 'pending_review')")
    ) {
      return {
        rows: [],
        rowCount: options.claimRowCount ?? 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      }
    }
    if (
      sql.includes('UPDATE payment_history') &&
      sql.includes("status = 'completed'") &&
      sql.includes('transaction_id IS NULL')
    ) {
      return {
        rows: [],
        rowCount: options.receiptEnrichmentRowCount ?? 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      }
    }
    if (sql.includes('SELECT id FROM user_subscriptions')) {
      return {
        rows: options.existingSubscription ? [{ id: 'subscription-1' }] : [],
        rowCount: options.existingSubscription ? 1 : 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      }
    }
    return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] }
  })
  const release = jest.fn()
  jest.mocked(db.getClient).mockResolvedValue({ query, release } as never)
  return { query, release }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('shared M-Pesa payment completion', () => {
  it('claims the pending row and activates the purchased plan in one transaction', async () => {
    const client = transactionClient({ claimRowCount: 1, existingSubscription: true })

    const result = await completeMpesaPayment({ record, evidence })

    expect(result).toEqual({
      outcome: 'completed',
      activated: true,
      receiptNumber: 'NLJ7RT61SV',
      receiptEnriched: false,
    })
    expect(setRlsContext).toHaveBeenCalledTimes(1)

    const claim = client.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status IN ('pending', 'processing', 'pending_review')")
    )
    expect(claim?.[1]).toContain(CHECKOUT_REQUEST_ID)
    expect(claim?.[1]).toContain('NLJ7RT61SV')

    const subscriptionUpdate = client.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE user_subscriptions') && sql.includes('seat_count')
    )
    expect(subscriptionUpdate?.[1]).toContain(1)
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true)
  })

  it('does not activate a subscription when another completion already won the row', async () => {
    const client = transactionClient({ claimRowCount: 0, receiptEnrichmentRowCount: 1 })

    const result = await completeMpesaPayment({ record, evidence })

    expect(result).toEqual({
      outcome: 'already_completed',
      activated: false,
      status: 'completed',
      receiptNumber: 'NLJ7RT61SV',
      receiptEnriched: true,
    })
    expect(client.query.mock.calls.some(([sql]) => sql.includes('user_subscriptions'))).toBe(false)
  })

  it('returns the authoritative failed status when the row changed to failed before the claim', async () => {
    const client = transactionClient({
      claimRowCount: 0,
      receiptEnrichmentRowCount: 0,
      storedStatus: 'failed',
    })

    const result = await completeMpesaPayment({ record, evidence })

    expect(result).toEqual({
      outcome: 'not_completed',
      activated: false,
      status: 'failed',
      receiptNumber: null,
      receiptEnriched: false,
    })
    expect(client.query.mock.calls.some(([sql]) =>
      sql.includes('SELECT') && sql.includes('FROM payment_history') && sql.includes('FOR UPDATE')
    )).toBe(true)
    expect(client.query.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes('transaction_id IS NULL')
    )).toBe(false)
    expect(client.query.mock.calls.some(([sql]) => sql.includes('user_subscriptions'))).toBe(false)
  })

  it('enriches a completed polling record that still carries the checkout id as its transaction id', async () => {
    const client = transactionClient({ claimRowCount: 0, receiptEnrichmentRowCount: 1 })

    const result = await completeMpesaPayment({
      record: { ...record, status: 'completed', transaction_id: CHECKOUT_REQUEST_ID },
      evidence,
    })

    expect(result).toEqual({
      outcome: 'already_completed',
      activated: false,
      status: 'completed',
      receiptNumber: 'NLJ7RT61SV',
      receiptEnriched: true,
    })
    const enrichment = client.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE payment_history') &&
      sql.includes("status = 'completed'") &&
      sql.includes('transaction_id IS NULL')
    )
    expect(enrichment?.[0]).toContain('transaction_id = checkout_request_id')
    expect(client.query.mock.calls.some(([sql]) => sql.includes('user_subscriptions'))).toBe(false)
  })

  it('rejects invalid evidence before opening a transaction', async () => {
    const result = await completeMpesaPayment({
      record,
      evidence: { ...evidence, amount: 1 },
    })

    expect(result).toMatchObject({ outcome: 'rejected', reason: 'amount_mismatch' })
    expect(db.getClient).not.toHaveBeenCalled()
  })

  it('rejects a non-zero provider result code before opening a transaction', async () => {
    const result = await completeMpesaPayment({
      record,
      evidence: { ...evidence, resultCode: 1032 },
    })

    expect(result).toEqual({ outcome: 'rejected', reason: 'non_zero_result_code' })
    expect(db.getClient).not.toHaveBeenCalled()
  })
})
