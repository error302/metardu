-- Align beacon writes with the authenticated user's request context. The
-- earlier policy used app.current_user_id, while newer API database helpers
-- use request.user_id, and it omitted an explicit INSERT check.

DROP POLICY IF EXISTS beacon_write_owner ON public.beacon_registry;
CREATE POLICY beacon_write_owner ON public.beacon_registry
  FOR ALL
  USING (created_by = NULLIF(current_setting('request.user_id', true), '')::UUID)
  WITH CHECK (created_by = NULLIF(current_setting('request.user_id', true), '')::UUID);
