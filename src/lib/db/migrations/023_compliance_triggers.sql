-- ─── Section 12: Compliance Triggers ───

-- ISK verification: only admins can set verified_isk = true
CREATE OR REPLACE FUNCTION prevent_self_isk_verification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.verified_isk = true AND OLD.verified_isk = false THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Only admins can verify ISK numbers';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER check_isk_verification
    BEFORE UPDATE ON surveyor_profiles
    FOR EACH ROW EXECUTE FUNCTION prevent_self_isk_verification();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Submission immutability: submitted packages cannot be modified
CREATE OR REPLACE FUNCTION prevent_submission_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status != 'rejected' THEN
    RAISE EXCEPTION 'Submitted packages cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER lock_submitted_packages
    BEFORE UPDATE ON project_submissions
    FOR EACH ROW EXECUTE FUNCTION prevent_submission_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
