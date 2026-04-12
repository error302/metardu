-- ─── Section 1.2: Role-Based Access Control ───

CREATE TYPE user_role AS ENUM ('surveyor', 'admin', 'enterprise', 'university', 'government_auditor');

DO $$ BEGIN
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'surveyor';
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin guard function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_suspended = false
  );
$$;

-- Government auditor guard
CREATE OR REPLACE FUNCTION is_auditor()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE id = auth.uid() AND role = 'government_auditor' AND is_suspended = false
  );
$$;
