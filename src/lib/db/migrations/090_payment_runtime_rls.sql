-- Keep the payment tables usable by the restricted web login while preserving
-- ownership checks for signed-in surveyors and trusted payment callbacks.

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- An authenticated claimant can see exactly the unclaimed Till payment whose
-- high-entropy receipt code they supplied, not every unclaimed payment row.
DROP POLICY IF EXISTS self_payment_history ON public.payment_history;
CREATE POLICY self_payment_history ON public.payment_history
  FOR SELECT
  USING (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    OR (
      user_id IS NULL
      AND status = 'unclaimed_payment'
      AND provider = 'safaricom_buygoods'
      AND transaction_id = NULLIF(current_setting('request.till_claim_code', true), '')
    )
  );

DROP POLICY IF EXISTS self_payment_history_insert ON public.payment_history;
CREATE POLICY self_payment_history_insert ON public.payment_history
  FOR INSERT
  WITH CHECK (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    OR current_setting('request.access_role', true) = 'payment_provider'
    OR (
      user_id IS NULL
      AND status = 'unclaimed_payment'
      AND provider = 'safaricom_buygoods'
    )
  );

DROP POLICY IF EXISTS self_payment_history_update ON public.payment_history;
CREATE POLICY self_payment_history_update ON public.payment_history
  FOR UPDATE
  USING (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    OR (user_id IS NULL AND status = 'unclaimed_payment')
    OR current_setting('request.access_role', true) IN ('payment_provider', 'billing_reconciliation', 'platform_admin')
  )
  WITH CHECK (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    OR current_setting('request.access_role', true) IN ('payment_provider', 'billing_reconciliation', 'platform_admin')
  );

DROP POLICY IF EXISTS service_payment_history_read ON public.payment_history;
CREATE POLICY service_payment_history_read ON public.payment_history
  FOR SELECT
  USING (current_setting('request.access_role', true) IN ('payment_provider', 'billing_reconciliation', 'platform_admin'));

-- The caller must authenticate a surveyor or validate a provider webhook
-- before using these narrow lookup functions. They return no payment payload;
-- they only let the application establish the verified owner's RLS context.
CREATE OR REPLACE FUNCTION public.metardu_payment_owner_for_provider_key(provider_key TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT payment.user_id::text
    FROM public.payment_history AS payment
   WHERE payment.user_id IS NOT NULL
     AND (
       payment.transaction_id = provider_key
       OR payment.provider_id = provider_key
       OR payment.metadata->>'mpesaCode' = provider_key
     )
   ORDER BY payment.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.metardu_claimable_till_payment(transaction_code TEXT)
RETURNS TABLE (id TEXT, amount NUMERIC, currency TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT payment.id::text, payment.amount::numeric, payment.currency::text
    FROM public.payment_history AS payment
   WHERE payment.transaction_id = transaction_code
     AND payment.status = 'unclaimed_payment'
     AND payment.user_id IS NULL
     AND payment.provider = 'safaricom_buygoods'
   ORDER BY payment.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.metardu_has_till_transaction(transaction_code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.payment_history AS payment
     WHERE (payment.transaction_id = transaction_code OR payment.metadata->>'mpesaCode' = transaction_code)
       AND payment.provider = 'safaricom_buygoods'
       AND payment.status IN ('unclaimed_payment', 'pending_review', 'completed')
  );
$$;

DROP POLICY IF EXISTS service_user_subscriptions ON public.user_subscriptions;
CREATE POLICY service_user_subscriptions ON public.user_subscriptions
  FOR ALL
  USING (current_setting('request.access_role', true) IN ('payment_provider', 'billing_reconciliation', 'platform_admin'))
  WITH CHECK (current_setting('request.access_role', true) IN ('payment_provider', 'billing_reconciliation', 'platform_admin'));

REVOKE ALL ON FUNCTION public.metardu_payment_owner_for_provider_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metardu_claimable_till_payment(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metardu_has_till_transaction(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metardu_payment_owner_for_provider_key(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metardu_claimable_till_payment(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metardu_has_till_transaction(TEXT) TO authenticated;
