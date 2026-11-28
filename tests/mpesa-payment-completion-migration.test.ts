/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'src/lib/db/migrations/127_mpesa_payment_completion.sql',
)

describe('M-Pesa payment completion migration', () => {
  it('expands payment_history with durable checkout and phone identities', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')
    const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean)
    const checkoutBackfill = statements.find(statement =>
      /\bUPDATE\b/i.test(statement) && statement.includes('checkout_request_id = transaction_id'),
    )
    const phoneBackfill = statements.find(statement =>
      /\bUPDATE\b/i.test(statement) && statement.includes("phone_number = metadata->>'phoneNumber'"),
    )
    const checkoutIndex = statements.find(statement =>
      statement.includes('CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_checkout_request_id'),
    )
    const pendingIndex = statements.find(statement =>
      statement.includes('CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_pending_checkout'),
    )
    const reconciliationAttemptIndex = statements.find(statement =>
      statement.includes('CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_pending_reconcile_attempt'),
    )

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS checkout_request_id\s+VARCHAR\(255\)/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS phone_number\s+VARCHAR\(20\)/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS last_reconcile_attempt_at\s+TIMESTAMPTZ/i)
    expect(checkoutBackfill).toBeDefined()
    expect(checkoutBackfill).toContain("transaction_id ~ '^ws_CO_[A-Za-z0-9]+$'")
    expect(checkoutBackfill).toContain("status IN ('pending', 'processing', 'pending_review')")
    expect(checkoutBackfill).not.toContain("status IN ('pending', 'processing', 'pending_review', 'completed')")
    expect(checkoutBackfill).not.toMatch(/transaction_id\s*<>\s*''/i)

    expect(phoneBackfill).toBeDefined()
    expect(phoneBackfill).toContain("payment_method = 'mpesa'")
    expect(phoneBackfill).toContain('phone_number IS NULL')
    expect(phoneBackfill).toContain('metadata IS NOT NULL')
    expect(phoneBackfill).toContain("metadata->>'phoneNumber' ~ '^254[17][0-9]{8}$'")
    expect(phoneBackfill).not.toMatch(/metadata->>'phoneNumber'\s*\)\s*$/i)
    const phonePattern = phoneBackfill?.match(/metadata->>'phoneNumber'\s*~\s*'([^']+)'/)?.[1]
    expect(phonePattern).toBeDefined()
    expect(new RegExp(phonePattern as string).test('254712345678')).toBe(true)
    expect(new RegExp(phonePattern as string).test('254712345678901')).toBe(false)
    expect(new RegExp(phonePattern as string).test('0712345678')).toBe(false)

    expect(checkoutIndex).toBeDefined()
    expect(checkoutIndex).toContain('ON public.payment_history (checkout_request_id)')
    expect(checkoutIndex).toContain("payment_method = 'mpesa'")
    expect(checkoutIndex).toContain('checkout_request_id IS NOT NULL')
    expect(checkoutIndex).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i)

    expect(pendingIndex).toBeDefined()
    expect(pendingIndex).toContain('ON public.payment_history (created_at)')
    expect(pendingIndex).toContain("payment_method = 'mpesa'")
    expect(pendingIndex).toContain("status IN ('pending', 'processing', 'pending_review')")
    expect(pendingIndex).toContain('checkout_request_id IS NOT NULL')

    expect(reconciliationAttemptIndex).toBeDefined()
    expect(reconciliationAttemptIndex).toMatch(
      /ON public\.payment_history\s*\(\s*last_reconcile_attempt_at ASC NULLS FIRST,\s*created_at ASC,\s*id ASC\s*\)/i,
    )
    expect(reconciliationAttemptIndex).toContain("payment_method = 'mpesa'")
    expect(reconciliationAttemptIndex).toContain("status IN ('pending', 'processing', 'pending_review')")
    expect(reconciliationAttemptIndex).toContain('checkout_request_id IS NOT NULL')
    expect(reconciliationAttemptIndex).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i)

    expect(sql).not.toMatch(/DROP\s+(COLUMN|CONSTRAINT)\s+transaction_id/i)
  })
})
