-- Existing audit read policies do not authorize insertion. Permit the service
-- to record its authenticated actor, without forging another actor or changing
-- historical records. The request context is set only after session validation.
DROP POLICY IF EXISTS append_own_audit_logs ON public.audit_logs;
CREATE POLICY append_own_audit_logs ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id::text = NULLIF(current_setting('request.user_id', true), ''));

-- DOWN:
DROP POLICY IF EXISTS append_own_audit_logs ON public.audit_logs;
