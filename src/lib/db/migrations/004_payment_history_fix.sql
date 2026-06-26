-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU PAYMENT HISTORY FIX — Migration 004
-- ─────────────────────────────────────────────────────────────────────────────
-- The payment_history table in 000_canonical_schema.sql was missing columns
-- that ALL payment code (Stripe, PayPal, M-Pesa) depends on:
--   - transaction_id: stores the provider's order/session/checkout ID
--   - plan_id: stores which subscription plan this payment is for
--
-- Without these columns, the entire payment flow is broken:
--   - INSERT ... RETURNING id → no plan_id to link payment to subscription
--   - UPDATE SET transaction_id = ... → column doesn't exist
--   - SELECT WHERE transaction_id = ... → column doesn't exist
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add transaction_id column — stores Stripe session ID, PayPal order ID, M-Pesa checkout request ID
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);

-- Add plan_id column — stores the subscription plan this payment is for
ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS plan_id VARCHAR(50);

-- Index for fast lookups by transaction_id (used by webhook handlers)
CREATE INDEX IF NOT EXISTS idx_payment_history_transaction_id ON payment_history(transaction_id);

-- Index for plan_id lookups (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_payment_history_plan_id ON payment_history(plan_id);

-- Add RLS policy for payment_history — users can insert their own payment records
-- (The existing 003 migration only added read policies)
DO $$ BEGIN
  DROP POLICY IF EXISTS "self_insert_payments" ON payment_history;
  CREATE POLICY "self_insert_payments" ON payment_history
    FOR INSERT WITH CHECK (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

-- Users can update their own payment records (e.g., status changes from pending to completed)
DO $$ BEGIN
  DROP POLICY IF EXISTS "self_update_payments" ON payment_history;
  CREATE POLICY "self_update_payments" ON payment_history
    FOR UPDATE USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;
