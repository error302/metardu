-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU RBAC — Migration 001
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the previous 020_rbac.sql which used auth.uid() (platform-specific).
-- This version uses public.surveyor_profiles and a current_user_id() helper
-- that reads from session state, compatible with self-hosted NextAuth.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create user_role ENUM type ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'surveyor', 'auditor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Add RBAC columns to surveyor_profiles ──────────────────────────────────
-- Note: surveyor_profiles already exists from 000_canonical_schema.sql
-- with the correct columns. Here we just ensure the role column uses the
-- proper ENUM type and add any missing columns.

-- Update the role column to use the ENUM type if it's still VARCHAR
DO $$ BEGIN
  -- Only alter if the column exists but is VARCHAR (not yet ENUM)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveyor_profiles'
      AND column_name = 'role'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE surveyor_profiles ALTER COLUMN role TYPE user_role
      USING role::user_role;
    ALTER TABLE surveyor_profiles ALTER COLUMN role SET DEFAULT 'surveyor';
  END IF;
END $$;

-- Ensure all RBAC columns exist (idempotent — they may already be there from 000)
DO $$ BEGIN
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS firm_name VARCHAR(255);
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
  ALTER TABLE surveyor_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. current_user_id() helper function ──────────────────────────────────────
-- This replaces auth.uid() for self-hosted NextAuth.
-- The application layer sets a session variable before each request:
--   SET LOCAL request.user_id = '<uuid>';
-- If not set, returns NULL (which will cause RLS policies to deny access).

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.user_id', true)::UUID;
$$;

-- ── 4. is_admin() guard function ──────────────────────────────────────────────
-- Checks if the current user has admin role in surveyor_profiles.
-- Uses current_user_id() instead of auth.uid().

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE user_id = current_user_id() AND role = 'admin' AND is_suspended = false
  );
$$;

-- ── 5. is_auditor() guard function ────────────────────────────────────────────
-- Checks if the current user has auditor role in surveyor_profiles.

CREATE OR REPLACE FUNCTION is_auditor()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM surveyor_profiles
    WHERE user_id = current_user_id() AND role = 'auditor' AND is_suspended = false
  );
$$;

-- ── 6. Index for fast role lookups ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_role ON surveyor_profiles(role);
CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_user_role ON surveyor_profiles(user_id, role, is_suspended);
