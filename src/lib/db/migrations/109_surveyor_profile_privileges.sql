-- Ownership permits editing declared profile details, not account authority.
-- Keep existing rows, roles, verification decisions and applied hashes intact.
CREATE OR REPLACE FUNCTION public.guard_surveyor_profile_privileges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  trusted BOOLEAN;
BEGIN
  -- Database maintenance uses the table owner/superuser. Web requests use the
  -- existing server-only service context, set only after platform authorization.
  SELECT r.rolsuper OR current_user = pg_get_userbyid(c.relowner)
    INTO trusted FROM pg_roles r CROSS JOIN pg_class c
    WHERE r.rolname = current_user AND c.oid = 'public.surveyor_profiles'::regclass;
  trusted := COALESCE(trusted, FALSE)
    OR COALESCE(current_setting('request.access_role', true) = 'platform_admin', FALSE);
  IF trusted THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Preserve a legitimate parent-account ON DELETE CASCADE. A direct profile
    -- delete while the account exists must never erase its restrictions.
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Account profile deletion requires an authorized workflow' USING ERRCODE = '42501';
  ELSIF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.role::text, 'surveyor') NOT IN ('user', 'surveyor')
      OR COALESCE(NEW.verified_isk, FALSE)
      OR COALESCE(NEW.is_suspended, FALSE)
      OR NEW.suspension_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Protected profile values require an authorized workflow' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.verified_isk IS DISTINCT FROM OLD.verified_isk
      OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
      OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
      RAISE EXCEPTION 'Protected profile values require an authorized workflow' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_surveyor_profile_privileges() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_surveyor_profile_privileges ON public.surveyor_profiles;
CREATE TRIGGER guard_surveyor_profile_privileges
  BEFORE INSERT OR UPDATE OR DELETE ON public.surveyor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_surveyor_profile_privileges();

-- Cross-account admin review/suspension must work under the restricted runtime
-- login. The generic browser proxy explicitly clears this service context.
DROP POLICY IF EXISTS platform_admin_manage_surveyor_profiles ON public.surveyor_profiles;
CREATE POLICY platform_admin_manage_surveyor_profiles ON public.surveyor_profiles
  FOR ALL USING (current_setting('request.access_role', true) = 'platform_admin')
  WITH CHECK (current_setting('request.access_role', true) = 'platform_admin');

-- DOWN:
DO $$ BEGIN
  RAISE EXCEPTION '109 is security-forward-only; do not restore self-assigned profile authority.';
END $$;
