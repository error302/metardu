-- Migration 127: durable M-Pesa checkout completion identities.
--
-- payment_history.transaction_id is overloaded across providers and M-Pesa
-- itself: before completion it may contain a CheckoutRequestID, while after a
-- Safaricom callback it contains the MpesaReceiptNumber. Reconciliation and
-- polling need an immutable checkout identity, and every automated completion
-- path needs the initiating phone to compare with Daraja evidence.
--
-- This is an expand-only migration. Existing columns and migration history
-- remain intact, so an older application version can continue to run while
-- the new columns are backfilled.

ALTER TABLE public.payment_history
  ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_reconcile_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payment_history.checkout_request_id IS
  'Immutable M-Pesa STK CheckoutRequestID used to bind provider evidence';
COMMENT ON COLUMN public.payment_history.phone_number IS
  'Normalized Kenyan initiating phone used to validate M-Pesa payment evidence';
COMMENT ON COLUMN public.payment_history.last_reconcile_attempt_at IS
  'Timestamp of the most recent M-Pesa reconciliation attempt';

-- Legacy unified-checkout rows kept the CheckoutRequestID in transaction_id
-- while pending. Move that value into the dedicated immutable identity and
-- clear the overloaded column so a later callback can replace it with the
-- real Safaricom receipt. Only the documented Daraja ws_CO_ identity shape is
-- eligible; any other non-empty value is preserved for operator review.
-- Completed rows may already contain a receipt and must not be rewritten.
UPDATE public.payment_history
   SET checkout_request_id = transaction_id,
       transaction_id = NULL
 WHERE payment_method = 'mpesa'
   AND status IN ('pending', 'processing', 'pending_review')
   AND checkout_request_id IS NULL
   AND transaction_id ~ '^ws_CO_[A-Za-z0-9]+$';

-- New unified checkout records store the initiating phone explicitly. The
-- metadata copy is a compatibility bridge for rows created by an earlier
-- candidate. Copy only an already-normalized Kenyan phone compatible with
-- normalizeMpesaPhoneNumber; other metadata values remain untouched for
-- operator review and fail closed at runtime.
UPDATE public.payment_history
   SET phone_number = metadata->>'phoneNumber'
 WHERE payment_method = 'mpesa'
   AND phone_number IS NULL
   AND metadata IS NOT NULL
   AND metadata->>'phoneNumber' ~ '^254[17][0-9]{8}$';

CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_checkout_request_id
  ON public.payment_history (checkout_request_id)
  WHERE payment_method = 'mpesa'
    AND checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_pending_checkout
  ON public.payment_history (created_at)
  WHERE payment_method = 'mpesa'
    AND status IN ('pending', 'processing', 'pending_review')
    AND checkout_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_history_mpesa_pending_reconcile_attempt
  ON public.payment_history (
    last_reconcile_attempt_at ASC NULLS FIRST,
    created_at ASC,
    id ASC
  )
  WHERE payment_method = 'mpesa'
    AND status IN ('pending', 'processing', 'pending_review')
    AND checkout_request_id IS NOT NULL;
