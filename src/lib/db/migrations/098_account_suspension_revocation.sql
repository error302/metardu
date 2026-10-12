-- Suspension revokes all existing sessions and ChatGPT grants atomically.
-- Restoring an account permits a new sign-in/connection; old credentials stay revoked.
CREATE OR REPLACE FUNCTION public.revoke_suspended_account_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT COALESCE(NEW.is_suspended, FALSE) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.is_suspended, FALSE) THEN RETURN NEW; END IF;
  END IF;
  UPDATE public.users SET session_version = session_version + 1 WHERE id = NEW.user_id;
  UPDATE public.chatgpt_grants SET revoked_at = NOW()
    WHERE user_id = NEW.user_id AND revoked_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_suspended_account_access() FROM PUBLIC;
DROP TRIGGER IF EXISTS revoke_suspended_account_access ON public.surveyor_profiles;
CREATE TRIGGER revoke_suspended_account_access
  AFTER INSERT OR UPDATE OF is_suspended ON public.surveyor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_suspended_account_access();

-- Close pre-existing suspended accounts without granting new access or restoring tokens.
UPDATE public.users u SET session_version = u.session_version + 1
  WHERE EXISTS (SELECT 1 FROM public.surveyor_profiles sp WHERE sp.user_id = u.id AND sp.is_suspended);
UPDATE public.chatgpt_grants g SET revoked_at = NOW()
  WHERE g.revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.surveyor_profiles sp WHERE sp.user_id = g.user_id AND sp.is_suspended);

-- DOWN:
DO $$ BEGIN
  RAISE EXCEPTION '098 is security-forward-only; revoked sessions and grants must not be restored.';
END $$;
