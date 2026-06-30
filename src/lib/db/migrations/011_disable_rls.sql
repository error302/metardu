-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU — Disable ALL Row-Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS was designed for Supabase's multi-tenant auth model where each request
-- runs as a different Postgres role. In our self-hosted setup with NextAuth,
-- the app connects as a single database user (metardu) and handles authorization
-- in the application layer. RLS policies using current_user_id() block INSERTs
-- and SELECTs because the DB session has no concept of the logged-in user.
--
-- This migration:
--   1. Drops all RLS policies from every table
--   2. Disables RLS enforcement on every table
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  pol RECORD;
BEGIN
  -- Drop all policies first
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
    RAISE NOTICE 'Dropped policy % on %.%', pol.policyname, pol.schemaname, pol.tablename;
  END LOOP;

  -- Disable RLS on all tables that have it enabled
  FOR r IN
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND (relrowsecurity = true OR relforcerowsecurity = true)
    ORDER BY relname
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'Disabled RLS on table %', r.relname;
  END LOOP;
END;
$$;
