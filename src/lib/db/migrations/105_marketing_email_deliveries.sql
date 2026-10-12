-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: marketing_email_deliveries
-- Created: 2026-10-12T20:32:57.898Z
-- ═══════════════════════════════════════════════════════════════════════════════

-- UP: Forward migration (applied on 'npm run migrate')
-- Track the monthly plan reminder so opted-in accounts are never contacted
-- more often than intended and overlapping cron runs cannot claim recipients
-- twice.
CREATE TABLE public.marketing_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  campaign_key VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('processing', 'sent', 'failed', 'needs_review', 'skipped')),
  attempt_count SMALLINT NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, campaign_key),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX idx_marketing_deliveries_recent_sent
  ON public.marketing_email_deliveries (user_id, sent_at DESC)
  WHERE status = 'sent';

ALTER TABLE public.marketing_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_deliveries_scheduler_only
  ON public.marketing_email_deliveries
  FOR ALL
  USING (current_setting('request.access_role', true) = 'billing_reconciliation')
  WITH CHECK (current_setting('request.access_role', true) = 'billing_reconciliation');

-- The consent table otherwise exposes rows only to their owner or admins.
-- The scheduled sender needs read-only access to verify an explicit grant.
CREATE POLICY marketing_scheduler_reads_consents
  ON public.user_consents
  FOR SELECT
  USING (current_setting('request.access_role', true) = 'billing_reconciliation');


-- DOWN: Rollback (not auto-applied — run manually if needed)
DROP POLICY marketing_scheduler_reads_consents ON public.user_consents;
DROP TABLE public.marketing_email_deliveries;
