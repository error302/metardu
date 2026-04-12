-- ─── Section 2.5: Encryption at Rest ───

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Auth role search path
DO $$ BEGIN
  ALTER ROLE authenticator SET search_path = public;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
